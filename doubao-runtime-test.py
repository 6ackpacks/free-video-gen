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

if __name__ == '__main__':
    unittest.main()
