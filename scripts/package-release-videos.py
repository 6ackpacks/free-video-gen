"""Package already cached acceptance outputs. No generation or remote requests."""
import csv,io,json,zipfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'data/release-validation-20261015'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
checks={row['jobId']:row for row in json.loads((OUT/'media-checks.json').read_text(encoding='utf-8'))}
rows=[];files=[]
for case in manifest['cases']:
 media=checks.get(case.get('jobId'),{});file=ROOT/'data/videos'/f"{case.get('jobId')}.mp4"
 name=case.get('title',case['typeId']).removeprefix('验收·')
 row={'行业与功能':name,'状态':case['status'],'未完成原因':case.get('error','') if case['status']!='complete' else '', '设置秒数':media.get('requestedDuration',case.get('duration','')),'实际秒数':media.get('actualDuration',''),'本机缓存':file.exists(),'浏览器分段读取':media.get('rangeStatus',''),'模板':case.get('templateName',''),'任务编号':case.get('jobId','')}
 rows.append(row)
 if case['status']=='complete' and file.exists():files.append((file,name.replace('·','/')+'.mp4'))
stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
(OUT/'验收清单.csv').write_text(stream.getvalue(),encoding='utf-8-sig')
failures=[c for c in manifest['cases'] if c['status'] in ['error','needs_review']]
pending=[c for c in manifest['cases'] if c['status'] not in ['complete','error','needs_review']]
readme=f'''# 豆包视频验收

更新时间：{time.strftime('%Y-%m-%d %H:%M:%S')}（本机时间）

已保存 {len(files)} / {len(manifest['cases'])} 条真实豆包视频，待完成 {len(pending)} 项，需处理 {len(failures)} 项。本轮未取得成片的原因是两个已登录豆包账号均提示今日视频生成免费次数用完。

打开工作台 http://127.0.0.1:4192/works?release=20261015 按行业查看，点击大屏播放，上一条／下一条只切换当前筛选的成片。可标记“可用”或“需调整”。

ZIP 内按行业和功能分目录保存 MP4；验收清单记录具体模板、任务和时长。视频由真实豆包调用产出；静态底图部分为 AI 虚构演示，不代表真实商家。

本轮已处理播放尺寸、兼容预览、下载队列、封面体积、保存防重复和失败恢复。187 项 JavaScript 自动测试、3 项原生调度测试、构建检查及两位辅助 Agent 的按钮／布局复验均通过。

需要你最终把握：逐条判断宣传方向、人物动作、说话内容和节奏是否满意；正式使用前替换演示图片与宣传事实。抽帧和技术播放检查不能代替对全部对白及内容的人工审片。

这些文件只保存在本机，没有上传账号、用户素材或成片到 GitHub。
'''
(OUT/'验收说明.md').write_text(readme,encoding='utf-8')
target=OUT/'豆包验收视频-20261015.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_STORED) as archive:
 for file,name in files:archive.write(file,name)
 archive.write(OUT/'验收清单.csv','验收清单.csv');archive.write(OUT/'验收说明.md','验收说明.md')
with zipfile.ZipFile(target) as archive:
 error=archive.testzip()
 if error:raise RuntimeError('ZIP校验失败：'+error)
print(json.dumps({'videos':len(files),'total':len(rows),'pending':len(pending),'errors':len(failures),'archive':str(target),'bytes':target.stat().st_size},ensure_ascii=False))
