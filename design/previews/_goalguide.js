/* Shared frame helpers for mock-goal-edit.html and mock-guide.html. Unique gg* names: _soc.js owns D, C, F, soc, eye. */
const ggSoc=(k,st='')=>`<span class="soc" style="${st}">${SOC[k]||SOC.idle}</span>`;
const ggSv=(d,c='#fff')=>`<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ggIcon={home:['#46b35a',ggSv('<path d="M4 11 12 4l8 7v9h-5v-5H9v5H4z" fill="#fff" stroke="none"/>')],j:['#ffc83d',ggSv('<path d="M6 19v-4M12 19V10M18 19V5"/>')],p:['#a78bfa',ggSv('<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M10 3h4"/>')],n:['#ff7a9c',ggSv('<path d="M5 5h6v14H5zM13 5h6v14h-6z" fill="#fff" stroke="none"/>')]};
const ggNav=(on='home')=>`<nav class="nav">${[['home','Hôm nay'],['j','Hành trình'],['add','Ghi'],['p','Luyện tập'],['n','Sổ tay']].map(([k,l])=>k==='add'?`<a class="add"><i>+</i>${l}</a>`:`<a class="${k===on?'on':''}"><i style="background:${ggIcon[k][0]}">${ggIcon[k][1]}</i>${l}</a>`).join('')}</nav>`;
const ggSb=(c='#2f3a33')=>`<div class="sb" style="color:${c}"><span>9:41</span><i></i></div>`;
const ggTop=(chip='Thi sau 37 ngày',lvl=2)=>`<div class="top">${chip?`<span class="chip">${chip}</span>`:''}<span class="av"><s>${ggSoc('idle')}</s><em>${lvl}</em></span></div>`;
const ggPencil=`<svg viewBox="0 0 24 24" fill="none" stroke="#d99a00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`;
const ggTrophy=(num,x,y,w=82,edit=true)=>`<svg class="trophy" style="left:${x}px;top:${y}px;width:${w}px" viewBox="0 0 90 100"><path d="M18 10 C2 10 2 40 24 44" fill="none" stroke="#f0a500" stroke-width="7"/><path d="M72 10 C88 10 88 40 66 44" fill="none" stroke="#f0a500" stroke-width="7"/><path d="M16 4 H74 C74 40 62 56 45 58 C28 56 16 40 16 4Z" fill="#ffc83d"/><path d="M45 18 l4 9 10 1-7.5 6.5 2.3 10-8.8-5.3-8.8 5.3 2.3-10L31 28l10-1Z" fill="#fff6d0"/><rect x="38" y="58" width="14" height="12" fill="#f0a500"/><rect x="24" y="70" width="42" height="9" rx="3" fill="#ffc83d"/><rect x="18" y="79" width="54" height="17" rx="3" fill="#2f3a33"/><text x="45" y="92" text-anchor="middle" font-family="Nunito" font-weight="900" font-size="12" fill="#ffd25e">${num}</text></svg>${edit?`<span class="edit-dot" style="left:${x+w*.8}px;top:${y+w*.86}px">${ggPencil}</span>`:''}`;
/* Stairs as tall bars from a base line. vals = step labels, cur = index of the green step (or -1), fresh = indexes drawn dashed (just added). */
function ggStairs(vals,{cur=4,x0=14,base=566,w=40,h0=50,rise=34,fresh=[],done=false}={}){
  let o='';
  vals.forEach((v,i)=>{const h=h0+rise*i,x=x0+i*w;
    const passed=done||i<cur,now=!done&&i===cur;
    const face=passed?'linear-gradient(90deg,#f5b82e 50%,#e39a12 50%)':now?'linear-gradient(90deg,#3fae55 50%,#2a8a40 50%)':'linear-gradient(90deg,#f1effa 50%,#e4e0f3 50%)';
    const capc=passed?'#ffd25e':now?'#6fd07f':'#f8f7fd';
    const isNew=fresh.includes(i);
    o+=`<div class="bar" style="left:${x}px;width:${w-2}px;height:${h}px;top:${base-h}px"><i style="background:${face};${isNew?'outline:2.5px dashed #b9a6ff;outline-offset:-2px;':''}"></i><b style="background:${capc}"></b><span style="${passed||now?'background:rgba(0,0,0,.18);color:#fff':'background:#fff;color:#9a94bb'}">${v}</span></div>`;});
  return o;}
const ggDots=(n,cur,txt)=>`<div class="dots">${Array.from({length:n},(_,i)=>`<i class="${i===cur?'g':i>cur?'o':''}"></i>`).join('')}<span>${txt}</span></div>`;
const ggNext=(k='TIẾP THEO · 20 PHÚT',t='Bấm giờ Part 7')=>`<div class="next"><div style="flex:1"><small>${k}</small><strong>${t}</strong></div><span class="wbtn">▶ Bắt đầu</span></div>`;
const ggPanel=`<div class="panel">${ggNext()}<div class="sum"><div>Còn 2 việc khác<small>Ôn 8 câu sai · Học 20 từ</small></div><a>Xem ⌄</a></div><div class="foot"><span class="pill" style="background:#fff0e6;color:#ff7a1a">🔥 6</span><span class="pill" style="background:#eaf6ec;color:#2f8a42">1/3 xong</span><span style="margin-left:auto;font-weight:900;font-size:13.5px;color:#1c8fe3">+ Thêm việc</span></div></div>`;
const ggFw=(t,s,h,wide)=>`<div class="fw${wide?' wide':''}"><b>${t}</b>${h}<span>${s}</span></div>`;
const ggConf=(n,x0,y0,dx=14)=>Array.from({length:n},(_,i)=>`<i style="position:absolute;z-index:9;width:9px;height:14px;border-radius:3px;left:${x0+i*dx}px;top:${y0+(i%5)*24}px;background:${['#ff7a9c','#ffc83d','#46b35a','#1c8fe3','#a78bfa'][i%5]};transform:rotate(${i*37}deg)"></i>`).join('');
/* Desktop sidebar; extra = HTML appended under Công cụ */
const ggSide=(on='home',extra='')=>`<aside class="side"><div class="logo"><i></i><div>toeic<small>progress</small></div></div>
${[['home','Hôm nay','#46b35a'],['j','Hành trình điểm','#ffc83d'],['p','Luyện tập','#a78bfa'],['n','Sổ tay','#ff7a9c'],['a','Thành tích','#1c8fe3']].map(([k,l,c])=>`<div class="si ${k===on?'on':''}"><i style="background:${c}"></i>${l}</div>`).join('')}
<div class="sgreen">+ Ghi điểm</div><div class="stool">CÔNG CỤ</div><div class="stl"><i style="background:#14b8a6">≈</i>Quy đổi điểm</div>${extra}</aside>`;
