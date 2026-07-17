// auth.js — HELIVI Final
// CONCEITO CHAVE: ownerUid = UID do dono da conta (admin que criou o sistema)
// Todos os colaboradores usam o ownerUid do admin para acessar os mesmos dados
'use strict';

const APENAS_ADMIN = ['historico.html','lucro.html','config.html','usuarios.html'];
const PAGINA_ATUAL = window.location.pathname.split('/').pop() || 'index.html';
window.PERFIL_ATUAL = 'admin';
window.OWNER_UID    = null; // UID do dono — compartilhado por todos

// ── Páginas especiais por perfil ──────────────────────────
const APENAS_COZINHA  = ['cozinha.html'];
const APENAS_BALCAO   = ['balcao.html'];

function requireAuth(cb) {
  let bootstrappedForUid = null;
  data.auth.onAuthStateChanged(async user => {
    if (!user) { location.href = 'index.html'; return; }

    // Supabase dispara INITIAL_SESSION + TOKEN_REFRESHED etc.; evita re-bind de forms/listeners
    if (bootstrappedForUid === user.uid) return;
    bootstrappedForUid = user.uid;

    // Busca perfil E ownerUid do colaborador
    const { perfil, ownerUid } = await buscarPerfilEOwner(user.uid);
    // Garante que ownerUid NUNCA é undefined
    const safeOwnerUid = ownerUid || user.uid;
    window.PERFIL_ATUAL = perfil;
    window.OWNER_UID    = safeOwnerUid;

    // Redireciona perfis especiais para suas páginas
    if (perfil === 'cozinha' && PAGINA_ATUAL !== 'cozinha.html' && PAGINA_ATUAL !== 'index.html') {
      location.href = 'cozinha.html'; return;
    }
    if (perfil === 'balcao' && PAGINA_ATUAL !== 'balcao.html' && PAGINA_ATUAL !== 'index.html') {
      location.href = 'balcao.html'; return;
    }

    // Bloqueia páginas só-admin
    if (APENAS_ADMIN.includes(PAGINA_ATUAL) && perfil !== 'admin') {
      location.href = 'dashboard.html'; return;
    }

    if (cb) cb(user, perfil, safeOwnerUid);
  });
}

async function buscarPerfilEOwner(uid) {
  try {
    const row = await data.usuarios.buscarPerfilPorUid(uid);
    if (row) {
      return {
        perfil:   row.role || 'atendente',
        ownerUid: row.ownerUid || uid // ownerUid salvo quando admin criou o colaborador
      };
    }
    // É o próprio dono da conta
    return { perfil: 'admin', ownerUid: uid };
  } catch(e) {
    return { perfil: 'admin', ownerUid: uid };
  }
}

function logoutUser()    { data.auth.signOut().then(() => location.href = 'index.html'); }
function getCurrentUID() { return data.auth.currentUser()?.uid || null; }
function getOwnerUID()   { return window.OWNER_UID || data.auth.currentUser()?.uid || null; }
function getInitials(s)  { return (s||'?')[0].toUpperCase(); }

/** Escape HTML — use em toda interpolação de dados do DB/usuário. */
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escHtml = escHtml;

// ── Toast ─────────────────────────────────────────────────
const _tw = (() => {
  const el = document.createElement('div'); el.className = 'toast-wrap';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  return el;
})();
function toast(msg, type='info', ms=3400) {
  const t = type==='success'?'ok':type==='error'?'err':type==='warning'?'warn':'info';
  const icons = {ok:'✅',err:'❌',warn:'⚠️',info:'ℹ️'};
  const el = document.createElement('div');
  el.className = `toast-item t-${t}`;
  el.innerHTML = `<span class="toast-icon">${icons[t]}</span><span class="toast-text">${msg}</span>`;
  _tw.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, ms);
}

// ── Modais ────────────────────────────────────────────────
function openModal(id)  { const e=document.getElementById(id);if(e){e.classList.add('open');document.body.style.overflow='hidden';}}
function closeModal(id) { const e=document.getElementById(id);if(e){e.classList.remove('open');document.body.style.overflow='';}}
document.addEventListener('click', e => {
  if (e.target.classList.contains('overlay')) { e.target.classList.remove('open'); document.body.style.overflow=''; }
});

function confirmar(msg) {
  return new Promise(res => {
    const ov=document.createElement('div'); ov.className='overlay open';
    ov.innerHTML=`<div class="modal-box confirm-box"><p class="confirm-msg">${msg}</p><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-full" id="_no">Cancelar</button><button class="btn btn-err btn-full" id="_yes">Confirmar</button></div></div>`;
    document.body.appendChild(ov); document.body.style.overflow='hidden';
    ov.querySelector('#_yes').onclick=()=>{ov.remove();document.body.style.overflow='';res(true);};
    ov.querySelector('#_no').onclick =()=>{ov.remove();document.body.style.overflow='';res(false);};
    ov.onclick=e=>{if(e.target===ov){ov.remove();document.body.style.overflow='';res(false);}};
  });
}

// ── Formatação ────────────────────────────────────────────
function fmtR(v) { return 'R$\u00A0'+Number(v||0).toFixed(2).replace('.',','); }
function fmtData(d) {
  const dt=d?.toDate?d.toDate():new Date(d);
  return dt.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtTempo(d) {
  const dt=d?.toDate?d.toDate():new Date(d);
  const diff=Math.floor((Date.now()-dt)/60000);
  if(diff<1)return'agora';if(diff<60)return diff+'min';
  return Math.floor(diff/60)+'h'+(diff%60?(diff%60)+'min':'');
}
function fmtMins(d){const dt=d?.toDate?d.toDate():new Date(d);return Math.floor((Date.now()-dt)/60000);}

// ── Sons ──────────────────────────────────────────────────
function beep(f=800,d=0.09){
  if(localStorage.getItem('somAtivo')==='false')return;
  try{const c=new(window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;g.gain.setValueAtTime(0.12,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.start();o.stop(c.currentTime+d);}catch(e){}
}
function beepOk(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.16),i*80));}
function beepKDS(){
  try{const c=new(window.AudioContext||window.webkitAudioContext)();[880,1100,880].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;o.type='square';const t=c.currentTime+i*0.14;g.gain.setValueAtTime(0.13,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.11);o.start(t);o.stop(t+0.11);});}catch(e){}
}

// ── Setup topbar ──────────────────────────────────────────
function setupTopbar(user, perfil, ownerUid) {
  const av=document.getElementById('topbarAvatar');
  const nm=document.getElementById('topbarName');
  if(av) av.textContent=getInitials(user.displayName||user.email);
  if(nm) nm.textContent=user.displayName||user.email.split('@')[0];
  document.getElementById('btnLogout')?.addEventListener('click',logoutUser);
  _aplicarMenu(perfil||'admin');
  _setupSidebar();
  _setupMobileMenu();
}

function _aplicarMenu(perfil) {
  if (perfil !== 'admin') {
    document.querySelectorAll('.sb-link[href], .mob-link[href]').forEach(link => {
      if (APENAS_ADMIN.includes(link.getAttribute('href'))) link.style.display = 'none';
    });
  }
  // Perfis cozinha/balcao: esconde tudo menos seu módulo
  if (perfil === 'cozinha' || perfil === 'balcao') {
    document.querySelectorAll('.sb-link[href], .mob-link[href]').forEach(link => {
      const href = link.getAttribute('href');
      const propria = perfil === 'cozinha' ? 'cozinha.html' : 'balcao.html';
      if (href !== propria && href !== 'index.html') link.style.display = 'none';
    });
  }
  // Badge
  const badge = document.getElementById('topbarPerfilBadge');
  if (badge) {
    const labels = { atendente:'Atendente', caixa:'Caixa', cozinha:'Cozinha', balcao:'Balcão', admin:'' };
    const cores  = { atendente:'b-blu', caixa:'b-grn', cozinha:'b-org', balcao:'b-blu', admin:'' };
    if (perfil !== 'admin') {
      badge.textContent = labels[perfil] || perfil;
      badge.className   = `badge ${cores[perfil]||'b-gry'}`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

function _setupSidebar(){
  const sb=document.querySelector('.sidebar'),mw=document.querySelector('.main'),tog=document.getElementById('sbToggle');
  if(!sb||!mw)return;
  if(localStorage.getItem('sb_collapsed')==='1'){sb.classList.add('collapsed');mw.classList.add('collapsed');}
  tog?.addEventListener('click',()=>{sb.classList.toggle('collapsed');mw.classList.toggle('collapsed');localStorage.setItem('sb_collapsed',sb.classList.contains('collapsed')?'1':'0');});
}
function _setupMobileMenu(){
  const btn=document.getElementById('topbarMenu'),sb=document.querySelector('.sidebar');
  if(!btn||!sb)return;
  let ov=document.querySelector('.sb-overlay');
  if(!ov){ov=document.createElement('div');ov.className='sb-overlay';document.body.appendChild(ov);}
  btn.addEventListener('click',()=>{sb.classList.add('mobile-open');ov.classList.add('show');});
  ov.addEventListener('click',()=>{sb.classList.remove('mobile-open');ov.classList.remove('show');});
  document.querySelectorAll('.sb-link').forEach(l=>l.addEventListener('click',()=>{sb.classList.remove('mobile-open');ov.classList.remove('show');}));
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.sb-logo-wrap img,.auth-logo,.kds-logo-wrap img').forEach(img=>{
    const check=()=>{if(!img.complete||img.naturalWidth===0){img.style.display='none';const fb=img.nextElementSibling;if(fb)fb.style.display='flex';}};
    img.addEventListener('error',check,{once:true});if(img.complete)check();
  });
});
