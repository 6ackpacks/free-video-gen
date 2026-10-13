import asyncio
from datetime import UTC, datetime, date
import importlib.util
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('workbench_service', 'doubao-service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

class RuntimeTests(unittest.TestCase):
    def test_quota_reset_without_zone_database(self):
        day, reset = service.quota_window_without_tzdata(datetime(2026, 10, 9, 16, 0, tzinfo=UTC), '00:00')
        self.assertEqual(day, date(2026, 10, 10))
        self.assertEqual(reset, datetime(2026, 10, 10, 16, 0))
        day, reset = service.quota_window_without_tzdata(datetime(2026, 10, 9, 15, 59, tzinfo=UTC), '00:00')
        self.assertEqual(day, date(2026, 10, 9))
        self.assertEqual(reset, datetime(2026, 10, 9, 16, 0))

    def test_scheduler_exception_is_reported(self):
        changes = []
        class BrokenService:
            async def _run(self, task_id, cancellation):
                raise RuntimeError('quota failure')
        module = SimpleNamespace(VideoTaskService=BrokenService)
        service.install_task_runtime_fixes(module)
        instance = BrokenService()
        instance.repository = SimpleNamespace(update_video_task=lambda *args, **kwargs: changes.append(kwargs))
        instance.logger = SimpleNamespace(exception=lambda message: None)
        asyncio.run(instance._run('task', None))
        self.assertEqual(changes[0]['status'], 'failed')
        self.assertIn('quota failure', changes[0]['error_message'])

    def test_generic_rate_limit_keeps_counter_and_recovers_false_exhaustion(self):
        import tempfile
        from pathlib import Path
        from datetime import timedelta
        from doupool.db.database import DatabaseManager
        from doupool.db.repository import AccountRepository
        from doupool.db.models import Account, AppLog
        with tempfile.TemporaryDirectory() as temp:
            manager = DatabaseManager(Path(temp) / 'test.sqlite3')
            manager.initialize()
            repository = AccountRepository(manager.database)
            now = datetime.now(UTC).replace(tzinfo=None)
            day, reset = service.quota_window_without_tzdata(now, '00:00')
            Account.create(id='test-a', display_name='测试', profile_dir=temp, video_quota_used=5, video_quota_date=day, video_limited_until=reset)
            AppLog.create(level='WARNING', module='video', event='video_quota_limited', message='rate limited', account='test-a', created_at=now)
            service.install_rate_limit_cooldown(repository)
            self.assertEqual(Account.get_by_id('test-a').video_quota_used, 0)
            Account.update(video_quota_used=2).where(Account.id=='test-a').execute()
            repository.mark_account_limited('test-a', reset, 5)
            account = Account.get_by_id('test-a')
            self.assertEqual(account.video_quota_used, 2)
            self.assertLess(account.video_limited_until, now+timedelta(minutes=6))
            manager.database.close()

if __name__ == '__main__':
    unittest.main()
