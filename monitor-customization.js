export const DEFAULT_MONITOR_PEOPLE='成年女性工作人员五官精致协调、清秀漂亮，肤色自然，淡妆，发型整洁，仪态大方；穿得体的专业门店制服。男性顾客自然整洁。不使用网红磨皮、美颜滤镜或广告棚拍质感。';
export const DEFAULT_MONITOR_SCENE='真实足浴养生门店的服务走廊，木饰面、暖色壁灯、整洁的护理包间木门、房间号码牌和足浴服务导视；有生活使用痕迹，不做酒店客房、夜店或豪华摄影棚。';
export function monitorCustomization(p){return {storeName:String(p.brandName||'').trim().slice(0,80),appearance:String(p.peopleBrief||'').trim().slice(0,2000),scene:String(p.contentBrief||'').trim().slice(0,3000)};}
export function monitorCustomizationPrompt(p,{video=false,lockedFrame=false}={}){
 const b=monitorCustomization(p),lines=[];
 if(video&&lockedFrame)lines.push('人物与背景沿用对应底图，不在视频阶段改脸、换人或重新装修。');
 else lines.push('人物形象：'+(p.materials?.personImageIds?.length?'上传的人物参考锁定真实面容与身份，仅整理自然仪容、服装和神态，不重新塑造五官。':b.appearance||DEFAULT_MONITOR_PEOPLE));
 lines.push(video&&lockedFrame?'门店环境沿用对应底图，保持足浴养生门店的真实空间、门、家具和通道。':'门店环境：'+DEFAULT_MONITOR_SCENE);
 if(b.scene)lines.push(video&&lockedFrame?'用户场景补充已经落实到对应底图，视频保留这些细节，不重新布置背景。':'用户背景与细节补充（仅补充模板允许的外观和环境细节）：'+b.scene);
 if(b.storeName)lines.push('用户指定的真实门店名称为'+JSON.stringify(b.storeName)+'。'+(video&&lockedFrame?'保持底图中该门店实体招牌的文字、位置和形状，稳定不跳动；底图没有招牌时不在视频阶段凭空加字。':'在走廊墙面或门楣自然设置一块实体门店招牌，招牌只写该名称，尽量准确清楚；不作为画面字幕、角标、贴纸或品牌水印。保留上传场景原有门、家具与通道布局。'));
 lines.push('以上补充不能改模板动作、人物数量与角色、起始姿态、动作顺序或结束状态；上传场景保留原有结构。固定45度高位俯拍、老旧CCTV灰蒙模糊广角质感和既定时间／通道文字优先。实体门店招牌是场景中的物件，允许出现；禁止额外的宣传字幕和浮层标识。');
 return lines.join('\n');
}
