import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-account-drawer');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':1480,'height':930});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 ctx.add_init_script("""if(window===top){window.accountBounds=[];window.accountHides=0;window.doubaoAccounts={list:async()=>({accounts:[{id:'local-test',name:'测试账号',managerAccountId:'remote-test',status:'idle'}]}),select:async()=>{},setBounds:r=>accountBounds.push(r),hide:()=>accountHides++};}""")
 offline=False
 def route(r):
  path=r.request.url.split(BASE)[-1].split('?')[0]
  if offline and path in ['/api/doubao','/api/doubao/accounts','/api/doubao/settings']:r.fulfill(status=503,json={'error':'模拟断开'});return
  if path=='/api/doubao':r.fulfill(json={'accounts':0,'totalAccounts':1,'message':'已有1个账号，服务暂时限流','ready':False});return
  if path=='/api/doubao/accounts':r.fulfill(json=[{'id':'remote-test','display_name':'测试账号','status':'active','enabled':True,'video_quota_used':0,'video_quota_total':5}]);return
  if path=='/api/doubao/settings':r.fulfill(json={'max_concurrency':1,'daily_quota':5});return
  if path=='/api/doubao/task-records':r.fulfill(json=[]);return
  if r.request.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
  r.continue_()
 ctx.route('**/api/**',route)
 try:
  page.goto(BASE+'/projects',wait_until='networkidle');page.locator('#projectSearch').fill('保留的筛选');before=page.url;page.locator('[data-app-nav=accounts]').click();expect(page.locator('#accountsDrawer')).to_be_visible();assert page.url==before
  frame=page.frame_locator('.accounts-drawer iframe');expect(frame.locator('#accountRows')).to_contain_text('测试账号');expect(frame.locator('#accountNotice')).to_contain_text('服务暂时限流');frame.locator('[data-open]').click();page.wait_for_timeout(400)
  bounds=page.evaluate('accountBounds.at(-1)');assert bounds['x']>=0 and bounds['y']>=60 and bounds['x']+bounds['width']<=1480 and bounds['y']+bounds['height']<=930,bounds
  assert frame.locator('body').evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'drawer.png'));page.locator('#closeAccountsDrawer').click();expect(page.locator('#accountsDrawer')).to_have_count(0);expect(page.locator('#projectSearch')).to_have_value('保留的筛选');assert page.evaluate('accountHides')>0
  offline=True;page.locator('[data-app-nav=accounts]').click();expect(frame.locator('#accountRows')).to_contain_text('测试账号');expect(frame.locator('#accountNotice')).to_contain_text('本地账号仍保留');page.locator('#closeAccountsDrawer').click()
  assert not errors,errors;print(json.dumps({'checks':['账号池当前页右侧打开，URL及输入保持','iframe复用原账号池及桌面接口','窗口边界包含父框架偏移且无溢出','关闭恢复页面并隐藏原生会话'],'pageErrors':errors,'paidRequests':0},ensure_ascii=False))
 finally:b.close()
