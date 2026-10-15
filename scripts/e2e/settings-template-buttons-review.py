"""Inspect settings/template/project controls using intercepted writes only."""
import copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-final-design');results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch();p=browser.new_page();catalog=p.request.get(BASE+'/api/studio').json();p.close()
 for width,height in [(1440,900),(1280,720),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height});page=ctx.new_page();page.set_default_timeout(7000);errors=[];writes=[];empty=False
  page.on('pageerror',lambda e:errors.append(str(e)))
  fixture=copy.deepcopy(catalog);pending=[]
  def intercept(route):
   req=route.request;path=req.url.split(BASE)[-1].split('?')[0]
   if req.method not in ['GET','HEAD']:
    writes.append(path)
    if path=='/api/studio/templates':pending.append(route);return
    if path.startswith('/api/studio/templates/') and req.method=='PATCH':
     item=next(t for t in fixture['templates'] if t['id']==__import__('urllib.parse',fromlist=['unquote']).unquote(path.rsplit('/',1)[-1]));item.update(req.post_data_json);route.fulfill(json=item);return
    if path=='/api/studio/connection-test':route.fulfill(json={'video':{'message':'模拟账号连接正常'},'api':{'message':'模拟图片连接正常'}});return
    route.fulfill(status=500,json={'error':'模拟保存失败'});return
   if path=='/api/studio':route.fulfill(json=fixture);return
   if path=='/api/studio/connections':route.fulfill(json={'values':{},'videoKeyConfigured':False,'textKeyConfigured':False});return
   if path.startswith('/api/video'):route.fulfill(status=404);return
   route.continue_()
  ctx.route('**/api/**',intercept)
  page.goto(BASE+'/settings',wait_until='networkidle')
  for tab in ['generalSettings','preferences','connectionSettings']:
   page.locator('#'+tab).click();expect(page.locator('#settingsContent')).not_to_be_empty()
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),tab
  page.locator('#checkSavedConnection').click();expect(page.locator('#savedConnectionState')).to_have_text('模拟账号连接正常')
  page.locator('.settings-advanced>summary').click();page.locator('#testImageConnection').click();expect(page.locator('#imageConnectionResult')).to_have_text('模拟图片连接正常')
  page.locator('#testConnection').click();expect(page.locator('#connectionResult')).to_have_text('模拟账号连接正常')
  page.locator('#saveConnections').click();expect(page.locator('#toast')).to_contain_text('模拟保存失败');expect(page.locator('#saveConnections')).to_be_enabled()
  page.locator('#cancelSettings').click();expect(page.locator('.settings-advanced')).not_to_have_attribute('open','')
  page.screenshot(path=str(OUT/f'buttons-settings-{width}.png'),full_page=True)
  page.goto(BASE+'/templates',wait_until='networkidle')
  template_count=page.locator('[data-type-card]').count()
  page.locator('#catalogSearch').fill('没有这个模板xyz');expect(page.locator('#catalogCards .empty')).to_be_visible();page.locator('#catalogSearch').fill('')
  controls={'edit':page.locator('[data-center-edit],[data-edit]').count(),'archive':page.locator('[data-archive]').count(),'favorite':page.locator('[data-template-favorite]').count()}
  page.locator('#createType').click();expect(page.locator('#createTypeForm')).to_be_visible()
  page.locator('#createTypeForm button[type=submit]').click();assert not any(p=='/api/studio/templates' for p in writes)
  page.locator('#createTypeForm [name=industry]').select_option('footspa')
  for name,value in [('name','只用于测试方案'),('actionName','动作一'),('description','模拟测试动作描述'),('materials','真实环境图片')]:page.locator('#createTypeForm [name='+name+']').fill(value)
  before=writes.count('/api/studio/templates');page.locator('#createTypeForm button[type=submit]').click();expect(page.locator('#createTypeForm button[type=submit]')).to_be_disabled()
  page.locator('#createTypeForm').evaluate('(form)=>form.requestSubmit()');assert writes.count('/api/studio/templates')==before+1
  pending.pop().fulfill(status=500,json={'error':'模拟保存失败'})
  expect(page.locator('#createTypeForm [role=status]')).to_have_text('模拟保存失败');expect(page.locator('#createTypeForm [role=status]')).to_be_visible()
  page.screenshot(path=str(OUT/f'buttons-create-template-{width}.png'),full_page=True)
  page.locator('#modal .close').click();page.locator('#manageActionTemplates').click();expect(page.locator('#centerGrid')).to_be_visible()
  page.locator('.template-menu>summary').first.click();page.locator('[data-center-edit]').first.click();expect(page.locator('#editName')).to_be_visible()
  before=writes.count('/api/studio/templates');page.locator('#saveTemplate').click();expect(page.locator('#saveTemplate')).to_be_disabled();page.locator('#saveTemplate').evaluate('(button)=>button.click()');assert writes.count('/api/studio/templates')==before+1
  pending.pop().fulfill(status=500,json={'error':'模拟保存失败'});expect(page.locator('#templateSaveFeedback')).to_have_text('模拟保存失败');page.locator('#templateSaveFeedback').scroll_into_view_if_needed();expect(page.locator('#templateSaveFeedback')).to_be_visible()
  page.locator('#modal .close').click();page.locator('#centerSearch').fill(fixture['templates'][0]['name']);page.locator('.template-menu>summary').first.click();page.locator('[data-archive]').first.click();expect(page.locator('#toast')).to_contain_text('模板状态已更新')
  page.locator('[data-source="archived"]').click();expect(page.locator('[data-archive]').first).to_have_text('恢复');page.locator('.template-menu>summary').first.click();page.locator('[data-archive]').first.click();expect(page.locator('#toast')).to_contain_text('模板状态已更新')
  page.get_by_role('link',name='返回模板类型',exact=True).click();expect(page.locator('#catalogCards')).to_be_visible()
  page.goto(BASE+'/studio?new=1',wait_until='networkidle')
  page.locator('[data-project-industry="footspa"]').click();page.locator('[data-project-type="footspa:environment"]').click()
  expect(page.locator('#newProjectName')).not_to_have_value('');expect(page.locator('#enterProject')).to_be_enabled()
  page.locator('#newProjectName').fill('');expect(page.locator('#enterProject')).to_be_disabled()
  page.locator('#newProjectName').fill('只读验收项目');page.screenshot(path=str(OUT/f'buttons-project-{width}.png'),full_page=True)
  page.locator('#enterProject').click();expect(page.locator('#app .notice.warning')).to_contain_text('模拟保存失败')
  expect(page.locator('#retryWorkspace')).to_be_visible();page.get_by_role('link',name='返回选择模板',exact=True).click();expect(page.locator('#chooserTypes')).to_be_visible()
  errors_before=list(errors)
  results.append({'viewport':[width,height],'settingsTabs':'passed','emptySearch':'passed','createValidation':'passed','createFailureFeedback':'inline visible','slowCreateAndEdit':'one POST each','managementEditArchiveRestoreBack':'passed','newProjectValidation':'passed','newProjectFailureRecovery':'passed','modernCenterManagementLink':'present','favorite':'no historical product function','templateGroups':template_count,'errors':errors_before,'mockedWrites':writes})
  ctx.close()
 browser.close()
(OUT/'buttons-review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(results,ensure_ascii=False))
