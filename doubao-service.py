"""Run DoubaoManager as a headless service owned by the video workbench."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
import time
from pathlib import Path
from uuid import uuid1, uuid4

import uvicorn
from fastapi import Header, HTTPException


def configure_browser_fallback() -> None:
    """Use an installed Edge when the transferred Playwright browser is absent."""
    from playwright.sync_api import BrowserType
    edge = Path(os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe'
    if sys.platform != 'win32' or not edge.exists():
        return
    original = BrowserType.launch_persistent_context
    def launch(browser, *args, **kwargs):
        if browser.name == 'chromium' and not kwargs.get('executable_path') and not kwargs.get('channel'):
            kwargs['executable_path'] = str(edge)
        return original(browser, *args, **kwargs)
    BrowserType.launch_persistent_context = launch


def quota_window_without_tzdata(now, reset_value):
    """China's current daily quotas use UTC+8; do not require Windows tzdata."""
    from datetime import UTC, datetime, time as dt_time, timedelta, timezone
    local_tz = timezone(timedelta(hours=8))
    instant = now.replace(tzinfo=UTC) if now.tzinfo is None else now
    local_now = instant.astimezone(local_tz)
    hour, minute = map(int, reset_value.split(':'))
    reset = datetime.combine(local_now.date(), dt_time(hour, minute), local_tz)
    before_reset = local_now < reset
    business_date = local_now.date() - timedelta(days=1) if before_reset else local_now.date()
    next_reset = reset if before_reset else reset + timedelta(days=1)
    return business_date, next_reset.astimezone(UTC).replace(tzinfo=None)


def install_task_runtime_fixes(module):
    module.quota_window = quota_window_without_tzdata
    original = module.VideoTaskService._run
    async def guarded_run(service, task_id, cancellation):
        try:
            await original(service, task_id, cancellation)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            service.repository.update_video_task(task_id, status='failed', error_message=f'豆包调度失败：{exc}')
            service.logger.exception('豆包调度失败')
    module.VideoTaskService._run = guarded_run


def install_exclusive_account_scheduler(repository) -> None:
    """Reserve one manager account per unfinished task before account locks are entered."""
    def choose_available_account(daily_quota=5, now=None, strategy="least_used"):
        now = now or __import__("datetime").datetime.now(__import__("datetime").UTC).replace(tzinfo=None)
        busy = {
            task.account_id
            for task in repository.list_video_tasks(limit=1000)
            if task.account_id and task.status in {"queued", "starting", "generating", "resolving"}
        }
        candidates = [
            account
            for account in repository.list_accounts()
            if account.id not in busy
            and account.enabled
            and account.status == "active"
            and int(account.video_quota_used or 0) < int(daily_quota)
            and (account.video_limited_until is None or account.video_limited_until <= now)
        ]
        if not candidates:
            return None
        if strategy == "round_robin":
            candidates.sort(key=lambda item: item.updated_at)
        else:
            candidates.sort(key=lambda item: (int(item.video_quota_used or 0), item.updated_at))
        return candidates[0]

    repository.choose_available_account = choose_available_account


def recover_interrupted_tasks(repository) -> None:
    """Release accounts left busy when the local desktop process was stopped."""
    for task in repository.list_video_tasks(limit=1000):
        if task.status in {"starting", "generating", "resolving"}:
            repository.update_video_task(
                task.id,
                status="cancelled",
                error_message="本地工作台上次退出时任务被中断，已释放账号",
            )


def install_session_import_route(app, token, repository, settings) -> None:
    from doupool.login.detector import DoubaoLoginDetector
    from playwright.sync_api import sync_playwright

    def import_profile(payload: dict) -> dict:
        identity = payload.get("identity") or {}
        expected_user_id = str(identity.get("user_id") or "").strip()
        if not expected_user_id:
            raise ValueError("未识别到已登录的豆包账号")
        profile_dir = settings.data_dir / "profiles" / f"electron-{uuid4()}"
        profile_dir.mkdir(parents=True, exist_ok=True)
        same_site = {"no_restriction": "None", "lax": "Lax", "strict": "Strict"}
        cookies = []
        for raw in payload.get("cookies") or []:
            item = {
                "name": str(raw.get("name") or ""),
                "value": str(raw.get("value") or ""),
                "domain": str(raw.get("domain") or ".doubao.com"),
                "path": str(raw.get("path") or "/"),
                "httpOnly": bool(raw.get("httpOnly")),
                "secure": bool(raw.get("secure")),
            }
            if raw.get("expirationDate"):
                item["expires"] = float(raw["expirationDate"])
            if raw.get("sameSite") in same_site:
                item["sameSite"] = same_site[raw["sameSite"]]
            if item["name"]:
                cookies.append(item)
        if not cookies:
            raise ValueError("豆包登录 Cookie 为空，请先在内嵌窗口完成登录")

        try:
            with sync_playwright() as playwright:
                context = playwright.chromium.launch_persistent_context(
                    str(profile_dir), headless=True, viewport={"width": 1100, "height": 760}
                )
                try:
                    context.add_cookies(cookies)
                    page = context.pages[0] if context.pages else context.new_page()
                    page.goto("https://www.doubao.com/", wait_until="domcontentloaded", timeout=30_000)
                    storage = payload.get("local_storage") or {}
                    page.evaluate(
                        "values => Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, String(value)))",
                        storage,
                    )
                    page.reload(wait_until="domcontentloaded", timeout=30_000)
                    verified = DoubaoLoginDetector().verify(page)
                    if verified is not None and verified.user_id != expected_user_id:
                        raise ValueError("登录态与当前账号不匹配")
                    if verified is None:
                        persisted_ids = {
                            item.get("value")
                            for item in context.cookies()
                            if item.get("name") in {"flow_cur_user_sec_id", "uid_tt"}
                        }
                        has_session = any(
                            item.get("value")
                            for item in context.cookies()
                            if item.get("name") in {"sessionid", "sessionid_ss", "sid_tt"}
                        )
                        if expected_user_id not in persisted_ids or not has_session:
                            raise ValueError("登录态同步验证失败，请在内嵌窗口刷新后重试")
                finally:
                    context.close()
        except Exception:
            if not any(profile_dir.iterdir()):
                profile_dir.rmdir()
            raise

        attempt = repository.create_login_attempt()
        account = repository.complete_login(
            attempt.id,
            {"user_id": expected_user_id, "nickname": identity.get("nickname") or (verified.nickname if verified else None)},
            str(profile_dir),
        )
        return {"id": account.id, "display_name": account.display_name, "status": account.status}

    @app.post("/api/accounts/import-session")
    async def import_session(payload: dict, x_doupool_token: str | None = Header(default=None)):
        if not x_doupool_token or not secrets.compare_digest(x_doupool_token, token):
            raise HTTPException(status_code=401, detail="invalid local token")
        try:
            return await asyncio.to_thread(import_profile, payload)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f'账号同步失败：{str(exc)[:500]}') from exc

    # create_app ends with a catch-all SPA route; the API route must precede it.
    route = app.router.routes.pop()
    app.router.routes.insert(0, route)


def build_confirmation_payload(conversation_id: str, section_id: str, fingerprint: str) -> dict:
    """Continue the same Doubao chat after its first-turn video plan."""
    now_ms = int(time.time() * 1000)
    return {
        "client_meta": {
            "local_conversation_id": "",
            "conversation_id": conversation_id,
            "bot_id": "7338286299411103781",
            "last_section_id": section_id,
            "last_message_index": None,
        },
        "messages": [{
            "local_message_id": str(uuid1()),
            "content_block": [{
                "block_type": 10000,
                "content": {
                    "text_block": {
                        "text": "确定生成，请立即开始生成视频。",
                        "icon_url": "",
                        "icon_url_dark": "",
                        "summary": "",
                    },
                    "pc_event_block": "",
                },
                "block_id": str(uuid4()),
                "parent_id": "",
                "meta_info": [],
                "append_fields": [],
            }],
            "message_status": 0,
        }],
        "option": {
            "send_message_scene": "",
            "create_time_ms": now_ms,
            "collect_id": "",
            "is_audio": False,
            "answer_with_suggest": False,
            "tts_switch": False,
            "need_deep_think": 0,
            "click_clear_context": False,
            "from_suggest": False,
            "is_regen": False,
            "is_replace": False,
            "is_from_click_option": False,
            "is_from_click_softlink": False,
            "disable_sse_cache": False,
            "select_text_action": "",
            "is_select_text": False,
            "resend_for_regen": False,
            "scene_type": 0,
            "unique_key": str(uuid4()),
            "start_seq": 0,
            "need_create_conversation": False,
            "conversation_init_option": {"need_ack_conversation": True},
            "regen_query_id": [],
            "edit_query_id": [],
            "regen_instruction": "",
            "no_replace_for_regen": False,
            "message_from": 0,
            "shared_app_name": "",
            "shared_app_id": "",
            "sse_recv_event_options": {"support_chunk_delta": True},
            "is_ai_playground": False,
            "is_old_user": True,
            "recovery_option": {
                "is_recovery": False,
                "req_create_time_sec": now_ms // 1000,
                "append_sse_event_scene": 0,
            },
            "message_storage_type": 0,
        },
        "user_context": [],
        "ext": {
            "answer_with_suggest": "0",
            "fp": fingerprint,
            "sub_conv_firstmet_type": "0",
            "collection_id": "",
            "commerce_credit_config_enable": "0",
        },
    }


class ConfirmingVideoRunner:
    """Doubao runner that accepts the generated plan before polling the video."""

    def __init__(self, browser_module, timeout: float = 420, poll_interval: float = 10):
        self.browser = browser_module
        self.timeout = timeout
        self.poll_interval = poll_interval
        self._download_runner = browser_module.PlaywrightVideoRunner(timeout, poll_interval)

    def run(self, profile_dir, prompt, model, ratio, duration, update, cancel_event, *, mode="t2v", image_paths=None):
        browser = self.browser
        with browser.sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                headless=False,
                viewport={"width": 940, "height": 650},
                args=["--window-size=1000,720", "--window-position=-2000,-2000"],
            )
            try:
                page = context.pages[0] if context.pages else context.new_page()
                page.goto("https://www.doubao.com/chat/", wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(2_000)
                fingerprint = browser.read_browser_fingerprint(page, context)

                uploaded_images = []
                if mode == "i2v":
                    paths = [Path(item) for item in (image_paths or [])]
                    if not paths:
                        raise RuntimeError("图生视频缺少本地图片")
                    if len(paths) > 9:
                        raise RuntimeError("图生视频最多支持 9 张图片")
                    for index, image_path in enumerate(paths, start=1):
                        if cancel_event.is_set():
                            raise RuntimeError("任务已取消")
                        if not image_path.is_file():
                            raise RuntimeError(f"图片不存在：{image_path}")
                        name, mime, b64 = browser.load_image_base64(image_path)
                        update(status="starting", error_message=f"正在上传单场景图片 {index}/{len(paths)}")
                        uploaded_images.append(page.evaluate(
                            browser.UPLOAD_IMAGE_SCRIPT,
                            {"name": name, "mime": mime, "base64Data": b64},
                        ))

                payload = browser.build_completion_payload(
                    prompt, model, ratio, duration, fingerprint,
                    mode=mode, images=uploaded_images or None,
                )
                local_id = payload["client_meta"]["local_conversation_id"]
                page.evaluate("id => history.replaceState({}, '', '/chat/' + id)", local_id)
                response = page.evaluate(browser.COMPLETION_SCRIPT, {"payload": payload})
                if response["status"] != 200:
                    raise RuntimeError(f"豆包提交接口返回 HTTP {response['status']}")
                first_ack = browser.parse_sse_ack(response["text"])
                update(status="starting", error_message="已提交图片和提示词，等待豆包生成方案")

                # Doubao's current UI answers with a video plan first. Give that
                # response time to settle, then explicitly accept it in the same chat.
                for _ in range(12):
                    if cancel_event.is_set():
                        raise RuntimeError("任务已取消")
                    page.wait_for_timeout(1_000)
                confirmation = build_confirmation_payload(
                    first_ack["conversation_id"], first_ack["section_id"], fingerprint
                )
                update(status="starting", error_message="已收到豆包方案，正在自动发送“确定生成”")
                confirmed = page.evaluate(browser.COMPLETION_SCRIPT, {"payload": confirmation})
                if confirmed["status"] != 200:
                    raise RuntimeError(f"豆包确认生成接口返回 HTTP {confirmed['status']}")
                confirm_ack = browser.parse_sse_ack(confirmed["text"])
                ack = {
                    "conversation_id": confirm_ack.get("conversation_id") or first_ack["conversation_id"],
                    "section_id": confirm_ack.get("section_id") or first_ack["section_id"],
                    "question_id": confirm_ack.get("question_id") or first_ack["question_id"],
                }
                update(status="generating", error_message=None, **ack)

                deadline = time.monotonic() + self.timeout
                while time.monotonic() < deadline:
                    if cancel_event.is_set():
                        raise RuntimeError("任务已取消")
                    chain = page.evaluate(browser.CHAIN_SCRIPT, {"conversationId": ack["conversation_id"]})
                    if chain["status"] != 200:
                        raise RuntimeError(f"豆包结果接口返回 HTTP {chain['status']}")
                    result = browser.parse_creation_result(chain["data"])
                    if result:
                        update(status="resolving", **result)
                        return self._download_runner._resolve_original_download(page, result, cancel_event)
                    page.wait_for_timeout(self.poll_interval * 1000)
                raise RuntimeError("视频生成超时")
            finally:
                context.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    sys.path.insert(0, str(project_root / "src"))

    # Must happen before importing modules that import Playwright.
    from doupool.paths import configure_runtime_environment

    configure_runtime_environment()
    configure_browser_fallback()

    from doupool.api.app import create_app
    from doupool.config import Settings
    from doupool.db.database import DatabaseManager
    from doupool.db.repository import AccountRepository
    from doupool.login.browser import PlaywrightLoginRunner
    from doupool.login.service import LoginService
    from doupool.logging.setup import configure_logging
    from doupool.settings.service import SettingsService
    import doupool.video.browser as video_browser
    import doupool.video.service as task_service
    install_task_runtime_fixes(task_service)
    VideoTaskService = task_service.VideoTaskService

    settings = Settings.from_environment()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    manager = DatabaseManager(settings.data_dir / "doupool.sqlite3")
    manager.initialize()
    configure_logging(settings.log_dir)
    repository = AccountRepository(manager.database)
    recover_interrupted_tasks(repository)
    install_exclusive_account_scheduler(repository)
    settings_service = SettingsService(repository, settings.data_dir, manager.path)
    login_service = LoginService(
        repository,
        PlaywrightLoginRunner(),
        settings.data_dir / "profiles",
        settings.login_timeout_seconds,
    )
    upload_script = Path(__file__).with_name("doubao-image-upload.js")
    if upload_script.exists():
        video_browser.UPLOAD_IMAGE_SCRIPT = upload_script.read_text(encoding="utf-8")
    video_service = VideoTaskService(
        repository,
        ConfirmingVideoRunner(video_browser),
        settings_service,
        assets_dir=settings.data_dir,
    )
    token = secrets.token_urlsafe(32)
    app = create_app(
        token,
        settings.frontend_dir,
        repository,
        login_service,
        video_service,
        settings_service,
    )
    install_session_import_route(app, token, repository, settings)
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        manager.close()


if __name__ == "__main__":
    main()
