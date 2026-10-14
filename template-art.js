export function templateArtwork(t={}){
  const suffix=(t.catalogType||t.id||'').split(':').at(-1);
  let category=t.categoryId||suffix;
  if(t.packId==='foot-spa-store'||t.id==='footspa:monitor')category='monitor';
  else if(t.packId==='home-massage'||t.id==='massage:service')category='massage-care';
  else if(t.packId==='ktv-business'||t.id==='ktv:interaction')category='interaction';
  else if(t.scene==='story')category='story';
  if(category==='product-service')category='service';
  const names={environment:'environment',service:'service',story:'story','avatar-talk':'avatar',monitor:'monitor','massage-care':'generic',interaction:'ktv'};
  return '/design-assets/visual-'+(names[category]||'generic')+'-v2.png';
}
