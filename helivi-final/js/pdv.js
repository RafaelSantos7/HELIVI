// pdv.js — HELIVI Final
// FLUXO DE COMANDA:
// 1. Criar comanda → fica na aba Comandas
// 2. "Adicionar Itens" → vai para Produtos, monta carrinho
// 3. "Enviar Pedido" → envia só os itens do carrinho para Cozinha/Bar + acumula na comanda
//    (SEM fechar a comanda, SEM pedir pagamento)
// 4. Repete 2-3 quantas vezes quiser
// 5. "Pagar" → caixa seleciona forma de pgto e fecha a comanda
'use strict';

let carrinho=[], todosProdutos=[], pedidoAtual=null;
let pagSel=null, parcelaSel=null, creditoMode='um';
let abaAtiva='produtos', todasComandas=[], filtroStatus='todos';
let comandaAtiva=null; // { id, cliente, mesa, obs }
let modoComanda=false; // true = enviando itens para comanda (sem pagar), false = venda direta
let pixAtivo=false, pixGerando=false, pixTxidAtual=null, pixComandaIdAtual=null, pixValorReaisAtual=null;
let pixUnsubscribe=null, pixVerificacaoTimer=null, pixCountdownTimer=null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  requireAuth((user, perfil, ownerUid) => {
    const oUid = ownerUid || window.OWNER_UID || user.uid;
    window.OWNER_UID = oUid;
    setupTopbar(user, perfil, oUid);
    const sub=document.getElementById('topbarSub');
    if(sub) sub.textContent=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    const nt=document.getElementById('nomeTopbar');
    if(nt) nt.textContent=localStorage.getItem('nomeEstab')||'HELIVI';
    loadProds(oUid);
    loadComandas(oUid);
    bindUI(oUid);
  });
});

// ══ PRODUTOS ═════════════════════════════════════════════
function loadProds(uid){
  db.collection('produtos').where('uid','==',uid)
    .onSnapshot(snap=>{
      todosProdutos=snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(a.categoria||'').localeCompare(b.categoria||'')||(a.nome||'').localeCompare(b.nome||''));
      renderCats(); renderProds();
    });
}
function renderCats(){
  const bar=document.getElementById('catBar');if(!bar)return;
  const cats=[...new Set(todosProdutos.map(p=>p.categoria||'Outros'))];
  bar.innerHTML=`<button class="cat-chip on" onclick="filtrarCat(this,'')">Todos</button>`+
    cats.map(c=>`<button class="cat-chip" onclick="filtrarCat(this,'${c}')">${c}</button>`).join('');
}
function filtrarCat(btn,cat){
  document.querySelectorAll('.cat-chip').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderProds(cat,document.getElementById('buscaPDV')?.value||'');
}
function renderProds(catF='',busca=''){
  const cont=document.getElementById('prodsGrid');if(!cont)return;
  let lista=todosProdutos;
  if(catF) lista=lista.filter(p=>(p.categoria||'Outros')===catF);
  if(busca) lista=lista.filter(p=>p.nome.toLowerCase().includes(busca.toLowerCase()));
  if(!lista.length){
    cont.innerHTML=`<div class="empty-box" style="grid-column:1/-1"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="empty-title">Nenhum produto</div><div class="empty-sub">Cadastre produtos primeiro</div></div>`;
    return;
  }
  const grupos={};
  lista.forEach(p=>{const c=p.categoria||'Outros';if(!grupos[c])grupos[c]=[];grupos[c].push(p);});
  cont.innerHTML=Object.entries(grupos).map(([cat,prods])=>`
    <div class="cat-grp" style="grid-column:1/-1">
      <div class="cat-grp-lbl">${cat}</div>
      <div class="prods-grid">${prods.map(p=>`
        <button class="prod-btn" id="pb-${p.id}" onclick="addItem('${p.id}')">
          <div class="pb-add">+</div>
          <div class="pb-nm">${p.nome}</div>
          <div class="pb-pr">${fmtR(p.preco)}</div>
          <div class="pb-ct">${p.categoria||''}</div>
        </button>`).join('')}</div>
    </div>`).join('');
}

// ══ CARRINHO ═════════════════════════════════════════════
function addItem(id){
  const p=todosProdutos.find(x=>x.id===id);if(!p)return;
  const ex=carrinho.find(i=>i.id===id&&!i.obs);
  if(ex)ex.quantidade++;
  else carrinho.push({id:p.id,nome:p.nome,preco:p.preco,custo:p.custo||0,categoria:p.categoria||'Outros',quantidade:1,obs:''});
  const btn=document.getElementById('pb-'+id);
  if(btn){btn.classList.add('flash');setTimeout(()=>btn.classList.remove('flash'),320);}
  beep(900,0.07); renderCart(); esconderPos();
}
function renderCart(){
  const body=document.getElementById('cartBody');
  const badge=document.getElementById('cartBadge');
  const totEl=document.getElementById('cartTotal');
  const qtd=carrinho.reduce((s,i)=>s+i.quantidade,0);
  if(badge)badge.textContent=qtd;
  if(!carrinho.length){
    if(body)body.innerHTML=`<div class="cart-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg><div class="cart-empty-txt">Carrinho vazio</div></div>`;
    if(totEl)totEl.textContent='R$\u00A00,00';
    atualizarBotaoFinalizar(); atualizarRest();
    if(window._updateFAB) window._updateFAB();
    return;
  }
  const total=carrinho.reduce((s,i)=>s+i.preco*i.quantidade,0);
  if(totEl)totEl.textContent=fmtR(total);
  if(body)body.innerHTML=carrinho.map((item,idx)=>`
    <div class="ci">
      <div class="ci-info">
        <div class="ci-nm">${item.nome}</div>
        <div class="ci-ct">${item.categoria}</div>
        <input class="ci-ob" type="text" placeholder="Observação..." value="${(item.obs||'').replace(/"/g,'&quot;')}" onchange="setObs(${idx},this.value)">
      </div>
      <div class="ci-ctrl">
        <button class="ci-qbtn" onclick="chgQ(${idx},-1)">−</button>
        <span class="ci-q">${item.quantidade}</span>
        <button class="ci-qbtn" onclick="chgQ(${idx},1)">+</button>
        <span class="ci-pr">${fmtR(item.preco*item.quantidade)}</span>
        <button class="ci-del" onclick="delItem(${idx})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>`).join('');
  atualizarBotaoFinalizar(); atualizarRest();
  if(window._updateFAB) window._updateFAB();
}
function setObs(idx,val){if(carrinho[idx])carrinho[idx].obs=val.trim();}
function chgQ(idx,d){carrinho[idx].quantidade+=d;if(carrinho[idx].quantidade<=0)carrinho.splice(idx,1);renderCart();esconderPos();}
function delItem(idx){carrinho.splice(idx,1);renderCart();esconderPos();}
async function limparCart(){
  if(!carrinho.length)return;
  const ok=await confirmar('Limpar todos os itens do carrinho?');if(!ok)return;
  carrinho=[];resetPag();renderCart();esconderPos();
}
function atualizarRest(){
  const total=carrinho.reduce((s,i)=>s+i.preco*i.quantidade,0);
  const c1=parseFloat(document.getElementById('cartao1In')?.value||'0')||0;
  const resta=Math.max(0,total-c1);
  const el=document.getElementById('restVal'),lbl=document.getElementById('restLbl');
  if(el)el.textContent=fmtR(resta);
  if(lbl)lbl.textContent=resta<=0?'✅ Coberto!':'Restante Cartão 2:';
}

// ── Botão finalizar muda conforme contexto ────────────────
function atualizarBotaoFinalizar(){
  const btn=document.getElementById('btnFinalizar');
  const payArea=document.getElementById('payAreaWrap');
  if(!btn)return;
  const temItens=carrinho.length>0;

  if(modoComanda && comandaAtiva){
    btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Enviar Pedido à Cozinha`;
    btn.style.cssText='background:var(--brand);color:#fff;box-shadow:var(--sh-brand)';
    btn.disabled=!temItens;
    if(payArea)payArea.style.display='none';
  } else {
    btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Finalizar Pedido`;
    btn.style.cssText='background:var(--ok);color:#fff';
    btn.disabled=!temItens;
    if(payArea)payArea.style.display='block';
  }
}

// ══ ENVIAR PEDIDO PARA COMANDA (sem pagar) ════════════════
async function enviarParaComanda(){
  if(!carrinho.length){toast('Adicione itens ao carrinho','warning');return;}
  if(!comandaAtiva?.id){toast('Nenhuma comanda selecionada','warning');return;}

  const uid=getCurrentUID();
  const btn=document.getElementById('btnFinalizar');
  const origHTML=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:rot .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>&nbsp;Enviando...`;

  try {
    const cliente=document.getElementById('inCliente')?.value.trim()||comandaAtiva.cliente||'';
    const mesa=document.getElementById('inMesa')?.value.trim()||comandaAtiva.mesa||'';
    const obsGeral=document.getElementById('inObs')?.value.trim()||'';

    // Número de envio (sub-pedido dentro da comanda)
    let numPedido=1;
    try{const r=db.collection('config').doc('cnt_'+uid),s=await r.get();numPedido=s.exists?s.data().ultimo+1:1;await r.set({ultimo:numPedido});}catch(e){}

    // Separação KDS — só os itens do carrinho atual (novos)
    const CATS_COZ=['comida','lanche','porção','porcao','entrada','combo'];
    const itensCoz=carrinho.filter(i=>CATS_COZ.some(k=>(i.categoria||'').toLowerCase().includes(k)));
    const itensBeb=carrinho.filter(i=>(i.categoria||'').toLowerCase().includes('bebida'));

    // Envia para KDS imediatamente
    if(itensCoz.length){
      await db.collection('kds_cozinha').add({
        uid,comandaId:comandaAtiva.id,numeroPedido:numPedido,
        cliente,mesa,obsGeral,
        itens:itensCoz.map(i=>({...i})),
        status:'novo',
        createdAt:new Date().toISOString(),
        serverTime:firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    if(itensBeb.length){
      await db.collection('kds_balcao').add({
        uid,comandaId:comandaAtiva.id,numeroPedido:numPedido,
        cliente,mesa,obsGeral,
        itens:itensBeb.map(i=>({...i})),
        status:'novo',
        createdAt:new Date().toISOString(),
        serverTime:firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Acumula os itens na comanda (para totalizar depois)
    const cmdRef=db.collection('comandas').doc(comandaAtiva.id);
    const cmdSnap=await cmdRef.get();
    const itensPrev=cmdSnap.exists?(cmdSnap.data().itens||[]):[];
    await cmdRef.update({
      itens:[...itensPrev,...carrinho.map(i=>({...i}))],
      ultimaAtualizacao:firebase.firestore.FieldValue.serverTimestamp()
    });

    // Limpa carrinho (mas mantém comanda ativa para novos itens)
    carrinho=[];
    document.getElementById('inObs').value='';
    document.getElementById('obsWrap').classList.remove('open');
    renderCart();

    const destinos=[];
    if(itensCoz.length)destinos.push('Cozinha');
    if(itensBeb.length)destinos.push('Balcão');
    const dest=destinos.length?` → ${destinos.join(' e ')}`:'';

    toast(`Pedido #${numPedido} enviado${dest}! 🍽️`,'success',4000);
    beepOk();

    // Volta para aba de comandas para o usuário ver o status
    setTimeout(()=>trocarAba('comandas'),1500);

  }catch(err){
    toast('Erro ao enviar: '+err.message,'error');
  }finally{
    btn.disabled=false;
    btn.innerHTML=origHTML;
  }
}

// ══ PAGAMENTO (venda direta ou fechar comanda) ════════════
function selPag(tipo,label){
  document.querySelectorAll('.pay-btn').forEach(b=>b.classList.remove('on'));
  document.querySelector(`.pay-btn[data-tipo="${tipo}"]`)?.classList.add('on');
  pagSel=label;
  document.getElementById('credBox').classList.toggle('show',tipo==='credito');
  document.getElementById('pixBox').classList.toggle('show',tipo==='pix');
  if(tipo==='pix')atualizarInfoPix();
  if(tipo!=='credito'){parcelaSel=null;creditoMode='um';}
}
function setCreditoMode(m){
  creditoMode=m;
  document.querySelectorAll('.cred-tab').forEach(b=>b.classList.remove('on'));
  document.querySelector(`.cred-tab[data-m="${m}"]`)?.classList.add('on');
  document.getElementById('parcsWrap').style.display=m==='um'?'block':'none';
  document.getElementById('doisCartWrap').classList.toggle('show',m==='dois');
}
function selParc(btn,p){document.querySelectorAll('.parc').forEach(b=>b.classList.remove('on'));btn.classList.add('on');parcelaSel=p;}

function calcularTotalPagamento(){
  return carrinho.reduce((s,i)=>s+i.preco*i.quantidade,0);
}

function atualizarInfoPix(){
  const total=calcularTotalPagamento();
  const valEl=document.getElementById('pixVal');
  const stEl=document.getElementById('pixSt');
  if(valEl)valEl.textContent=fmtR(total);
  if(stEl){
    stEl.className='pix-st wait';
    stEl.textContent=pixAtivo
      ? '⏳ Aguardando pagamento PIX...'
      : 'Clique em Finalizar Pedido para exibir o QR Code';
  }
}

async function obterComandaIdParaPix(){
  if(comandaAtiva?.id)return comandaAtiva.id;

  const uid=getCurrentUID();
  const ownerUid=getOwnerUID();
  const cliente=document.getElementById('inCliente')?.value.trim()||'';
  const mesa=document.getElementById('inMesa')?.value.trim()||'';
  const obs=document.getElementById('inObs')?.value.trim()||'';
  const criadorNome=document.getElementById('topbarName')?.textContent||'';
  const docData={
    uid:ownerUid,ownerUid,
    atendente:criadorNome,criadorUid:uid,
    cliente,mesa,obs,
    itens:carrinho.map(i=>({...i})),
    status:'aberta',
    createdAt:new Date().toISOString(),
    serverTime:firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref=await db.collection('comandas').add(docData);
  comandaAtiva={id:ref.id,cliente,mesa,obs};
  modoComanda=false;
  atualizarBannerComanda();
  return ref.id;
}

async function finalizarPedido(){
  // Se está em modo comanda, envia para cozinha/bar (sem pagar)
  if(modoComanda&&comandaAtiva){
    await enviarParaComanda();
    return;
  }
  // Modo venda direta: precisa de pagamento
  if(!carrinho.length){toast('Adicione itens ao carrinho','warning');return;}
  if(!pagSel){toast('Selecione a forma de pagamento','warning');return;}
  const tipo=document.querySelector('.pay-btn.on')?.dataset.tipo;
  if(tipo==='pix'){
    if(pixGerando){toast('Gerando QR Code PIX...','info');return;}
    if(pixAtivo){toast('Aguardando confirmação do PIX','info');return;}
    const total=calcularTotalPagamento();
    if(total<=0){toast('Valor inválido para PIX','warning');return;}
    pixGerando=true;
    const btn=document.getElementById('btnFinalizar');
    if(btn)btn.disabled=true;
    try{
      const comandaId=await obterComandaIdParaPix();
      const resultado=await criarPagamentoPix(comandaId,total);
      if(!resultado.sucesso)toast('Falha ao gerar PIX. Tente novamente.','error');
    }catch(err){
      toast('Erro ao gerar PIX: '+err.message,'error');
    }finally{
      pixGerando=false;
      if(btn&&!pixAtivo)btn.disabled=!carrinho.length;
    }
    return;
  }
  if(tipo==='credito'&&creditoMode==='dois'){
    const total=carrinho.reduce((s,i)=>s+i.preco*i.quantidade,0);
    const c1=parseFloat(document.getElementById('cartao1In').value||'0')||0;
    if(c1<=0||c1>=total){toast('Informe corretamente o valor do Cartão 1','warning');return;}
  }
  await fecharComandaComPagamento();
}

// ── Fechar comanda COM pagamento ──────────────────────────
async function fecharComandaComPagamento(){
  if(!pagSel){toast('Selecione a forma de pagamento','warning');return;}
  const uid=getCurrentUID();
  const btn=document.getElementById('btnFinalizar');
  const origLabel=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:rot .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>&nbsp;Salvando...`;

  try{
    const tipo=document.querySelector('.pay-btn.on')?.dataset.tipo||'';
    const cliente=document.getElementById('inCliente')?.value.trim()||'';
    const mesa=document.getElementById('inMesa')?.value.trim()||'';
    const obsGeral=document.getElementById('inObs')?.value.trim()||'';

    // Se tem comanda ativa, usa os itens acumulados dela como total
    // Se é venda direta, usa o carrinho
    let itensFinais=carrinho.map(i=>({...i}));
    if(comandaAtiva?.id){
      // Pega todos os itens da comanda do Firestore
      const cmdSnap=await db.collection('comandas').doc(comandaAtiva.id).get();
      if(cmdSnap.exists) itensFinais=cmdSnap.data().itens||[];
    }

    const total=itensFinais.reduce((s,i)=>s+i.preco*i.quantidade,0);
    const lucro=itensFinais.reduce((s,i)=>s+(i.preco-i.custo)*i.quantidade,0);
    let pagStr=pagSel,c1=null,c2=null;
    if(tipo==='credito'&&creditoMode==='um'&&parcelaSel)pagStr+=` – ${parcelaSel}`;
    if(tipo==='credito'&&creditoMode==='dois'){c1=parseFloat(document.getElementById('cartao1In').value||'0')||0;c2=parseFloat((total-c1).toFixed(2));pagStr='Crédito – 2 Cartões';}

    let numPedido=1;
    try{const r=db.collection('config').doc('cnt_'+uid),s=await r.get();numPedido=s.exists?s.data().ultimo+1:1;await r.set({ultimo:numPedido});}catch(e){}

    const pedido={
      uid,cliente,mesa,obsGeral,
      itens:itensFinais,
      total,lucro,pagamento:pagStr,
      cartao1:c1,cartao2:c2,
      numeroPedido:numPedido,
      status:'pago',
      createdAt:new Date().toISOString(),
      serverTime:firebase.firestore.FieldValue.serverTimestamp()
    };

    // Fecha a comanda se existir
    if(comandaAtiva?.id){
      pedido.comandaId=comandaAtiva.id;
      await db.collection('comandas').doc(comandaAtiva.id).update({
        status:'fechada',pagamento:pagStr,total,
        fechadoEm:firebase.firestore.FieldValue.serverTimestamp()
      });
      // Remove da lista local imediatamente
      const idx=todasComandas.findIndex(c=>c.id===comandaAtiva.id);
      if(idx>=0)todasComandas[idx].status='fechada';
      comandaAtiva=null;
      modoComanda=false;
      atualizarBannerComanda();
    }

    // Salva pedido (histórico)
    const ref=await db.collection('pedidos').add(pedido);
    pedidoAtual={...pedido,id:ref.id};

    // Na venda direta, envia para KDS agora
    // Na comanda, já foi enviado antes por enviarParaComanda()
    if(!pedido.comandaId){
      const CATS_COZ=['comida','lanche','porção','porcao','entrada','combo'];
      const itensCoz=itensFinais.filter(i=>CATS_COZ.some(k=>(i.categoria||'').toLowerCase().includes(k)));
      const itensBeb=itensFinais.filter(i=>(i.categoria||'').toLowerCase().includes('bebida'));
      if(itensCoz.length)await db.collection('kds_cozinha').add({uid,pedidoId:ref.id,numeroPedido:numPedido,cliente,mesa,obsGeral,itens:itensCoz,status:'novo',createdAt:new Date().toISOString(),serverTime:firebase.firestore.FieldValue.serverTimestamp()});
      if(itensBeb.length)await db.collection('kds_balcao').add({uid,pedidoId:ref.id,numeroPedido:numPedido,cliente,mesa,obsGeral,itens:itensBeb,status:'novo',createdAt:new Date().toISOString(),serverTime:firebase.firestore.FieldValue.serverTimestamp()});
    }

    carrinho=[];
    document.getElementById('inCliente').value='';
    document.getElementById('inMesa').value='';
    document.getElementById('inObs').value='';
    document.getElementById('obsWrap').classList.remove('open');
    renderCart();
    atualizarBotaoFinalizar();
    mostrarPos();
    toast(`Pedido #${numPedido} finalizado! 🎉`,'success');
    beepOk();
    if(localStorage.getItem('impressaoAuto')==='true')setTimeout(()=>imprimirCupom(pedidoAtual),600);
    resetPag();

  }catch(err){
    toast('Erro: '+err.message,'error');
  }finally{
    btn.disabled=false;
    btn.innerHTML=origLabel;
  }
}

function resetPag(){
  document.querySelectorAll('.pay-btn').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.parc').forEach(b=>b.classList.remove('on'));
  ['credBox','pixBox'].forEach(id=>document.getElementById(id)?.classList.remove('show'));
  const c1i=document.getElementById('cartao1In');if(c1i)c1i.value='';
  document.getElementById('doisCartWrap')?.classList.remove('show');
  document.getElementById('parcsWrap').style.display='block';
  document.querySelectorAll('.cred-tab').forEach(b=>b.classList.remove('on'));
  document.querySelector('.cred-tab[data-m="um"]')?.classList.add('on');
  pagSel=null;parcelaSel=null;creditoMode='um';
  pixAtivo=false;pixGerando=false;
  atualizarInfoPix();
}
function mostrarPos(){document.getElementById('posDone').classList.add('show');}
function esconderPos(){document.getElementById('posDone').classList.remove('show');}
function novoPedido(){
  pedidoAtual=null;comandaAtiva=null;modoComanda=false;
  atualizarBannerComanda();atualizarBotaoFinalizar();
  esconderPos();resetPag();
}

// ══ COMANDAS ═════════════════════════════════════════════
function loadComandas(uid){
  // TODOS os usuários logados veem TODAS as comandas do dia em tempo real
  const inicioDia = new Date(); inicioDia.setHours(0,0,0,0);

  db.collection('comandas').where('ownerUid','==',uid).limit(200)
    .onSnapshot(snap=>{
      todasComandas=snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .filter(c=>{
          const dt=c.serverTime?.toDate?c.serverTime.toDate():new Date(c.createdAt||0);
          return dt>=inicioDia;
        })
        .sort((a,b)=>{
          const da=a.serverTime?.toDate?a.serverTime.toDate():new Date(a.createdAt||0);
          const db2=b.serverTime?.toDate?b.serverTime.toDate():new Date(b.createdAt||0);
          return db2-da;
        });
      renderComandas();
      const abertas=todasComandas.filter(c=>c.status==='aberta').length;
      const tc=document.getElementById('tabCount');
      if(tc)tc.textContent=abertas||'';
    },()=>{
      // Fallback sem ownerUid (primeira vez / sem índice)
      db.collection('comandas').where('uid','==',uid).limit(100)
        .onSnapshot(snap=>{
          const inicioDia2=new Date();inicioDia2.setHours(0,0,0,0);
          todasComandas=snap.docs.map(d=>({id:d.id,...d.data()}))
            .filter(c=>{const dt=c.serverTime?.toDate?c.serverTime.toDate():new Date(c.createdAt||0);return dt>=inicioDia2;})
            .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
          renderComandas();
        });
    });
}

function renderComandas(){
  const el=document.getElementById('listaComandas');if(!el)return;
  let lista=[...todasComandas].filter(c=>c.status!=='cancelada');
  if(filtroStatus==='aberta')  lista=lista.filter(c=>c.status==='aberta');
  if(filtroStatus==='fechada') lista=lista.filter(c=>c.status==='fechada');
  const busca=(document.getElementById('buscaComanda')?.value||'').toLowerCase();
  if(busca)lista=lista.filter(c=>(c.cliente||'').toLowerCase().includes(busca)||(c.mesa||'').toLowerCase().includes(busca));
  if(!lista.length){
    const vazio=filtroStatus==='aberta'?'Nenhuma comanda aberta':filtroStatus==='fechada'?'Nenhuma comanda fechada':'Nenhuma comanda hoje';
    el.innerHTML=`<div class="empty-box"><div class="empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg></div><div class="empty-title">${vazio}</div><div class="empty-sub">Clique em "+ Nova Comanda" para criar</div></div>`;
    return;
  }
  el.innerHTML=lista.map(c=>{
    const aberta=c.status==='aberta';
    const tempo=fmtTempo(c.serverTime||c.createdAt);
    const itensQtd=(c.itens||[]).reduce((s,i)=>s+i.quantidade,0);
    const totalC=(c.itens||[]).reduce((s,i)=>s+i.preco*i.quantidade,0);
    const nome=[c.mesa?'Mesa '+c.mesa:'',c.cliente].filter(Boolean).join(' · ')||'Sem identificação';
    const isAtiva=comandaAtiva?.id===c.id;

    const itensHtml=(c.itens||[]).map(i=>`
      <div class="cir">
        <div><div class="cir-nm">${i.quantidade}x ${i.nome}</div>${i.obs?`<div class="cir-ob">${i.obs}</div>`:''}</div>
        <div class="cir-pr">${fmtR(i.preco*i.quantidade)}</div>
      </div>`).join('');

    return `
    <div class="cmd-card ${aberta?'ab':'fg'}${isAtiva?' cmd-card-ativa':''}" id="cmdcard-${c.id}">
      <div class="cmd-hd" onclick="toggleCmd('${c.id}')">
        <div class="cmd-info">
          <div class="cmd-id" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="background:${aberta?'rgba(249,115,22,.12)':'rgba(22,163,74,.1)'};color:${aberta?'var(--brand)':'var(--ok)'};padding:1px 7px;border-radius:50px;font-size:10px;font-weight:700">${aberta?'ABERTA':'FECHADA'}</span>
            ${isAtiva?`<span style="background:rgba(249,115,22,.2);color:var(--brand);padding:1px 7px;border-radius:50px;font-size:10px;font-weight:700">SELECIONADA</span>`:''}
            <span style="color:var(--t4);font-size:10px">${tempo}</span>
          </div>
          <div class="cmd-nm">${nome}</div>
          <div class="cmd-mt">${itensQtd} iten${itensQtd!==1?'s':''}${c.obs?' · '+c.obs:''}</div>
        </div>
        <div class="cmd-rt">
          <div class="cmd-total">${fmtR(totalC)}</div>
          <div style="font-size:10px;color:var(--t4);margin-top:2px;text-align:right">▼ detalhes</div>
        </div>
      </div>
      <div class="cmd-body" id="body-${c.id}">
        ${itensHtml.length?itensHtml:`
          <div style="padding:10px;text-align:center;border:1.5px dashed var(--brd);border-radius:var(--r2);margin:4px 0">
            <p style="font-size:12px;color:var(--t4)">Nenhum item ainda</p>
            <p style="font-size:11px;color:var(--t5)">Clique em <strong style="color:var(--brand)">Adicionar Itens</strong></p>
          </div>`}
        ${c.obs?`<div class="cmd-obs" style="margin-top:8px">📝 ${c.obs}</div>`:''}
        ${totalC>0?`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--brd);margin-top:8px">
            <span style="font-weight:700;font-size:14px">Total acumulado</span>
            <span style="font-weight:800;font-size:16px;color:var(--brand)">${fmtR(totalC)}</span>
          </div>`:''}
        <div class="cmd-acts">
          ${aberta?`
            <button class="btn btn-primary btn-sm" onclick="adicionarNaComanda('${c.id}')" style="flex:1;justify-content:center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar Itens
            </button>
            ${totalC>0?`
            <button class="btn btn-ok btn-sm" onclick="iniciarPagamentoComanda('${c.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              Pagar — ${fmtR(totalC)}
            </button>`:''}
            <button class="btn btn-ghost btn-sm" onclick="cancelarComanda('${c.id}')" title="Cancelar" style="padding:6px 8px;color:var(--err)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          `:`
            <button class="btn btn-ghost btn-sm" onclick="imprimirComandaObj('${c.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Imprimir
            </button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleCmd(id){document.getElementById('body-'+id)?.classList.toggle('open');}

// ── Criar nova comanda ────────────────────────────────────
function mostrarFormComanda(){
  const form=document.getElementById('novaComandaForm');
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
  setTimeout(()=>document.getElementById('ncCliente')?.focus(),150);
}
function esconderFormComanda(){
  document.getElementById('novaComandaForm').style.display='none';
  ['ncCliente','ncMesa','ncObs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}
async function criarComanda(){
  const uid=getCurrentUID();
  const cliente=document.getElementById('ncCliente').value.trim();
  const mesa=document.getElementById('ncMesa').value.trim();
  const obs=document.getElementById('ncObs').value.trim();
  const btn=document.getElementById('btnCriarComanda');
  const origHTML=btn.innerHTML;
  btn.disabled=true;
  btn.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:rot .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>&nbsp;Criando...`;
  try{
    const agora=new Date();
    const ownerUid = getOwnerUID();
    const criadorUid = getCurrentUID();
    const criadorNome = document.getElementById('topbarName')?.textContent||'';
    const docData={uid:ownerUid,ownerUid,atendente:criadorNome,criadorUid,cliente,mesa,obs,itens:[],status:'aberta',createdAt:agora.toISOString(),serverTime:firebase.firestore.FieldValue.serverTimestamp()};
    const ref=await db.collection('comandas').add(docData);
    // Adiciona imediatamente na lista local
    todasComandas.unshift({id:ref.id,...docData,serverTime:{toDate:()=>agora,seconds:Math.floor(agora/1000)}});
    renderComandas();
    // Abre o card
    setTimeout(()=>{
      const body=document.getElementById('body-'+ref.id);if(body)body.classList.add('open');
      const card=document.getElementById('cmdcard-'+ref.id);if(card)card.scrollIntoView({behavior:'smooth',block:'center'});
    },100);
    esconderFormComanda();
    const label=[mesa?'Mesa '+mesa:'',cliente].filter(Boolean).join(' · ');
    toast(`✅ Comanda criada${label?' — '+label:''}! Clique em "Adicionar Itens" para incluir produtos.`,'success',5000);
  }catch(err){
    toast('Erro: '+err.message,'error');
  }finally{
    btn.disabled=false;btn.innerHTML=origHTML;
  }
}

// ── Adicionar itens a comanda → vai para Produtos ─────────
function adicionarNaComanda(comandaId){
  const c=todasComandas.find(x=>x.id===comandaId);if(!c)return;
  // Ativa comanda e modo comanda
  comandaAtiva={id:c.id,cliente:c.cliente,mesa:c.mesa,obs:c.obs};
  modoComanda=true;
  // Preenche campos e limpa carrinho para novos itens
  if(document.getElementById('inCliente'))document.getElementById('inCliente').value=c.cliente||'';
  if(document.getElementById('inMesa'))document.getElementById('inMesa').value=c.mesa||'';
  carrinho=[];
  renderCart();
  atualizarBannerComanda();
  atualizarBotaoFinalizar();
  trocarAba('produtos');
  const label=[c.mesa?'Mesa '+c.mesa:'',c.cliente].filter(Boolean).join(' · ');
  toast(`Comanda selecionada${label?' — '+label:''}. Adicione itens e clique "Enviar Pedido".`,'info',5000);
}

// ── Iniciar pagamento de uma comanda ──────────────────────
function iniciarPagamentoComanda(comandaId){
  const c=todasComandas.find(x=>x.id===comandaId);if(!c)return;
  // Ativa comanda mas em modo PAGAMENTO (não modo comanda)
  comandaAtiva={id:c.id,cliente:c.cliente,mesa:c.mesa,obs:c.obs};
  modoComanda=false; // modo pagamento — vai mostrar formas de pgto
  if(document.getElementById('inCliente'))document.getElementById('inCliente').value=c.cliente||'';
  if(document.getElementById('inMesa'))document.getElementById('inMesa').value=c.mesa||'';
  // Carrinho com itens da comanda para mostrar o total
  carrinho=(c.itens||[]).map(i=>({...i}));
  renderCart();
  atualizarBannerComanda();
  atualizarBotaoFinalizar();
  trocarAba('produtos');
  toast('Selecione a forma de pagamento e finalize.','info',4000);
  setTimeout(()=>document.getElementById('payAreaWrap')?.scrollIntoView({behavior:'smooth',block:'nearest'}),400);
}

// ── Cancelar comanda ──────────────────────────────────────
async function cancelarComanda(comandaId){
  const ok=await confirmar('Cancelar esta comanda?');if(!ok)return;
  try{
    await db.collection('comandas').doc(comandaId).update({status:'cancelada'});
    todasComandas=todasComandas.filter(c=>c.id!==comandaId);
    renderComandas();
    if(comandaAtiva?.id===comandaId){comandaAtiva=null;modoComanda=false;atualizarBannerComanda();atualizarBotaoFinalizar();}
    toast('Comanda cancelada','info');
  }catch(err){toast('Erro: '+err.message,'error');}
}

// ── Imprimir comanda ──────────────────────────────────────
function imprimirComandaObj(comandaId){
  const c=todasComandas.find(x=>x.id===comandaId);if(!c)return;
  imprimirCupom({...c,numeroPedido:c.id.slice(-5).toUpperCase(),pagamento:c.pagamento||'—',total:(c.itens||[]).reduce((s,i)=>s+i.preco*i.quantidade,0)});
}

// ── Banner comanda ativa ──────────────────────────────────
function atualizarBannerComanda(){
  const el=document.getElementById('cartComandaBanner');if(!el)return;
  if(comandaAtiva){
    const parts=[comandaAtiva.mesa?'Mesa '+comandaAtiva.mesa:'',comandaAtiva.cliente].filter(Boolean);
    const nome=parts.length?parts.join(' · '):'Comanda aberta';
    const modo=modoComanda?'Enviando itens':'Pagando';
    const cor=modoComanda?'var(--brand)':'var(--ok)';
    el.style.display='block';
    el.innerHTML=`<div style="background:${modoComanda?'rgba(249,115,22,.08)':'rgba(22,163,74,.08)'};border:1px solid ${modoComanda?'rgba(249,115,22,.25)':'rgba(22,163,74,.25)'};border-radius:var(--r2);padding:7px 11px;display:flex;align-items:center;gap:7px;font-size:12px;color:${cor};font-weight:600">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="flex:1">${modo}: ${nome}</span>
      <button onclick="desvinculaComanda()" style="background:none;border:none;cursor:pointer;color:var(--t4);padding:0;line-height:1;font-size:15px" title="Desvincular">✕</button>
    </div>`;
  }else{
    el.style.display='none';el.innerHTML='';
  }
}
function desvinculaComanda(){
  comandaAtiva=null;modoComanda=false;
  carrinho=[];renderCart();
  atualizarBannerComanda();atualizarBotaoFinalizar();
  toast('Comanda desvinculada','info');
}

// ── Filtros e busca ───────────────────────────────────────
function aplicarFiltroStatus(btn,status){
  document.querySelectorAll('[data-st]').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');filtroStatus=status;renderComandas();
}
function buscarComanda(){renderComandas();}

// ── ABAS ─────────────────────────────────────────────────
function trocarAba(aba){
  abaAtiva=aba;
  document.getElementById('tabProd')?.classList.toggle('on',aba==='produtos');
  document.getElementById('tabCmd')?.classList.toggle('on',aba==='comandas');
  const vProd=document.getElementById('viewProd');
  const vCmd=document.getElementById('viewCmd');
  if(vProd){vProd.style.display=aba==='produtos'?'flex':'none';if(aba==='produtos')vProd.style.flexDirection='column';}
  if(vCmd){vCmd.style.display=aba==='comandas'?'flex':'none';if(aba==='comandas')vCmd.style.flexDirection='column';}
}

// ── BIND ─────────────────────────────────────────────────
function bindUI(uid){
  document.getElementById('tabProd')?.addEventListener('click',()=>trocarAba('produtos'));
  document.getElementById('tabCmd')?.addEventListener('click',()=>trocarAba('comandas'));
  document.getElementById('buscaPDV')?.addEventListener('input',e=>renderProds('',e.target.value));
  document.getElementById('buscaComanda')?.addEventListener('input',buscarComanda);
  document.getElementById('btnLimpar')?.addEventListener('click',limparCart);
  document.getElementById('btnFinalizar')?.addEventListener('click',finalizarPedido);
  document.getElementById('btnNovoPedido')?.addEventListener('click',novoPedido);
  document.getElementById('btnImprimir')?.addEventListener('click',()=>pedidoAtual&&imprimirCupom(pedidoAtual));
  document.getElementById('btnWhatsApp')?.addEventListener('click',()=>pedidoAtual&&enviarWhatsApp(pedidoAtual,localStorage.getItem('whatsappTel')||''));
  document.getElementById('cartao1In')?.addEventListener('input',atualizarRest);
  document.getElementById('btnObsTog')?.addEventListener('click',()=>document.getElementById('obsWrap').classList.toggle('open'));
  document.querySelectorAll('.pay-btn').forEach(b=>b.addEventListener('click',()=>selPag(b.dataset.tipo,b.dataset.label)));
  document.querySelectorAll('.cred-tab').forEach(b=>b.addEventListener('click',()=>setCreditoMode(b.dataset.m)));
  document.querySelectorAll('.parc').forEach(b=>b.addEventListener('click',()=>selParc(b,b.dataset.p)));
  document.getElementById('btnNovaComanda')?.addEventListener('click',mostrarFormComanda);
  document.getElementById('btnCriarComanda')?.addEventListener('click',criarComanda);
  document.getElementById('btnCancelarComanda')?.addEventListener('click',esconderFormComanda);
  document.querySelectorAll('[data-st]').forEach(btn=>btn.addEventListener('click',()=>aplicarFiltroStatus(btn,btn.dataset.st)));
  ['ncCliente','ncMesa','ncObs'].forEach(id=>document.getElementById(id)?.addEventListener('keypress',e=>{if(e.key==='Enter')criarComanda();}));
}

function parseValidadePix(validadeEm, expiracaoSegundos = 3600) {
  if (validadeEm != null) {
    if (typeof validadeEm === 'number') return validadeEm;
    if (typeof validadeEm === 'string') {
      const ms = Date.parse(validadeEm);
      if (!Number.isNaN(ms)) return ms;
    }
    if (validadeEm.seconds != null) return validadeEm.seconds * 1000;
    if (validadeEm._seconds != null) return validadeEm._seconds * 1000;
    const ms = new Date(validadeEm).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now() + expiracaoSegundos * 1000;
}

function formatCountdownPix(segundos) {
  const total = Math.max(0, Math.floor(segundos));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min > 0) return `Válido por ${min}:${String(sec).padStart(2, '0')}`;
  return `Válido por ${total} segundos`;
}

// ── SEÇÃO 2: Criar Pagamento PIX (Efi Bank via Firebase Functions) ─────────
async function criarPagamentoPix(comandaId, valor) {
  try {
    // Validar entrada
    if (!comandaId) {
      alert('Erro: Comanda não identificada');
      return { sucesso: false };
    }
    if (!valor || valor <= 0) {
      alert('Erro: Valor inválido');
      return { sucesso: false };
    }

    // Mostrar loading
    mostrarLoading('Gerando QR Code PIX...');

    // Converter valor para centavos (Firebase espera assim)
    // Exemplo: R$ 150,00 = 15000 centavos
    const valorCentavos = Math.round(valor * 100);
    pixValorReaisAtual = valor;
    pixComandaIdAtual = comandaId;

    // Chamar Firebase Function
    const criarPixFn = firebase.functions().httpsCallable('criarPagamentoPix');
    const result = await criarPixFn({
      comandaId: comandaId,
      valor: valorCentavos,
      descricao: `Pagamento comanda ${comandaId}`
    });

    // Esconder loading
    fecharLoading();

    // Extrair dados do resultado
    const { txid, qrcode, pixCopiaECola, qrcodeImagem, validadeEm, expiracaoSegundos } = result.data;

    console.log('✅ PIX criado com sucesso');
    console.log('TXID:', txid);
    console.log('Válido até:', validadeEm);

    // Salvar TXID globalmente para referência
    pixTxidAtual = txid;
    pixAtivo = true;
    atualizarInfoPix();

    // Exibir tela de QR Code
    mostrarTelaQrCode({ qrcode, pixCopiaECola, qrcodeImagem }, valor, txid, validadeEm, expiracaoSegundos);

    // Iniciar monitoramento automático
    iniciarMonitoramentoPix(comandaId, txid);
    iniciarVerificacaoPeriodicaPix(comandaId, txid);

    return { sucesso: true, txid, qrcode, pixCopiaECola };

  } catch (erro) {
    console.error('❌ Erro ao criar PIX:', erro.code || erro.message, erro);
    fecharLoading();
    const msgRede = /internal|failed|network|cors/i.test(String(erro.message))
      ? 'Falha de comunicação com o emulador/servidor (o navegador pode exibir como CORS). Tente de novo em alguns segundos.'
      : erro.message;
    alert(
      'Erro ao gerar QR Code PIX:\n' + msgRede +
      '\n\nSe aparecer "credenciais inválidas", configure helivi-functions/.env.local ' +
      'com Client_Id e Client_Secret do painel Efi (aba Homologação) e reinicie o emulador.'
    );
    return { sucesso: false, erro: erro.message };
  }
}

// ── SEÇÃO 3: Monitorar Comanda em Tempo Real (Firestore Listener) ────────
async function finalizarPixConfirmado(valorFallback, comandaId) {
  if (!pixAtivo) return;

  pixAtivo = false;
  if (pixVerificacaoTimer) {
    clearInterval(pixVerificacaoTimer);
    pixVerificacaoTimer = null;
  }

  fecharTelaQrCode();
  await onPagamentoConfirmado({ id: comandaId }, valorFallback);
  pixComandaIdAtual = null;
}

// Esta função escuta mudanças na comanda e detecta quando PIX é confirmado
function iniciarMonitoramentoPix(comandaId, txid) {
  console.log('👁️ Iniciando monitoramento da comanda...');

  // Se já existe listener, cancelar
  if (pixUnsubscribe) {
    pixUnsubscribe();
  }

  // Criar listener Firestore
  pixUnsubscribe = db.collection('comandas').doc(comandaId)
    .onSnapshot((doc) => {
      if (!doc.exists) return;

      const cmd = doc.data();

      // ✅ PIX FOI CONFIRMADO!
      if (cmd.statusPagamento === 'confirmado') {
        console.log('✅✅✅ PIX CONFIRMADO!');
        console.log('Valor:', cmd.pixValor);
        console.log('Data/Hora:', cmd.pixConfirmadoEm);
        finalizarPixConfirmado(cmd.pixValor, doc.id);
      }

      // ⏰ PIX EXPIROU
      const agora = new Date();
      const validadeEm = cmd.pixValidadeEm ? new Date(cmd.pixValidadeEm.toDate()) : null;

      if (validadeEm && agora > validadeEm && cmd.statusPagamento === 'aguardando_pix') {
        console.log('❌ PIX expirou');
        pixAtivo = false;
        if (pixVerificacaoTimer) clearInterval(pixVerificacaoTimer);

        mostrarAviso('QR Code expirou. Gere um novo para continuar.');
      }
    }, (erro) => {
      console.error('Erro ao monitorar comanda:', erro);
    });
}

// ── SEÇÃO 4: Verificação Manual de Status (Fallback) ───────────────────
// Se por algum motivo o webhook não chegar, permitir verificação manual
async function verificarPagamentoPixManualmente(txid) {
  try {
    mostrarLoading('Verificando pagamento...');

    const verificarPixFn = firebase.functions().httpsCallable('verificarPagamentoPix');
    const result = await verificarPixFn({ txid });

    fecharLoading();

    const { pago, status, dataPagamento, valor } = result.data;

    console.log('Status PIX:', status);
    console.log('Pago?', pago);
    console.log('Data:', dataPagamento);

    if (pago) {
      console.log('✅ PIX confirmado!');
      finalizarPixConfirmado(valor, pixComandaIdAtual);
      return true;
    } else {
      console.log('⏳ PIX ainda aguardando...');
      mostrarAviso('Pagamento ainda não recebido. Tente novamente em alguns segundos.');
      return false;
    }
  } catch (erro) {
    console.error('Erro ao verificar PIX:', erro.message);
    fecharLoading();
    alert('Erro ao verificar status: ' + erro.message);
    return false;
  }
}

// ── SEÇÃO 5: Verificação Automática Periódica (Opcional) ────────────────
// Verificar a cada 5 segundos se PIX foi pago (enquanto aguarda webhook)
function iniciarVerificacaoPeriodicaPix(comandaId, txid, intervalMs = 5000) {
  console.log('⏰ Iniciando verificação periódica a cada', intervalMs / 1000, 'segundos');

  // Limpar timer anterior se existir
  if (pixVerificacaoTimer) clearInterval(pixVerificacaoTimer);

  // Verificar a cada intervalo
  pixVerificacaoTimer = setInterval(async () => {
    if (!pixAtivo) {
      clearInterval(pixVerificacaoTimer);
      return;
    }

    try {
      const verificarPixFn = firebase.functions().httpsCallable('verificarPagamentoPix');
      const result = await verificarPixFn({ txid });

      if (result.data.pago) {
        console.log('✅ PIX confirmado via verificação periódica');
        finalizarPixConfirmado(result.data.valor, comandaId);
      }
    } catch (erro) {
      console.error('Erro na verificação periódica:', erro.message);
    }
  }, intervalMs);
}

// ── SEÇÃO 6: UI - Exibir Tela de QR Code ─────────────────────────────────
function mostrarTelaQrCode(dadosPix, valor, txid, validadeEm, expiracaoSegundos = 3600) {
  const pixCopiaECola = typeof dadosPix === 'object' ? dadosPix.pixCopiaECola : null;
  const qrcodeImagem = typeof dadosPix === 'object' ? dadosPix.qrcodeImagem : null;
  const qrcodeLegacy = typeof dadosPix === 'string' ? dadosPix : dadosPix?.qrcode;
  // Criar container
  const container = document.createElement('div');
  container.id = 'modal-qrcode-pix';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;

  // Conteúdo do modal
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 32px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;

  // Título
  const title = document.createElement('h2');
  title.textContent = '💳 Pagamento PIX';
  title.style.cssText = 'margin: 0 0 16px 0; color: #333; font-size: 24px;';

  // Valor
  const valorEl = document.createElement('div');
  valorEl.textContent = `Valor: ${fmtR(valor)}`;
  valorEl.style.cssText = 'font-size: 20px; color: #666; margin-bottom: 24px; font-weight: bold;';

  const qrImg = document.createElement('img');
  qrImg.alt = 'QR Code PIX';
  qrImg.style.cssText = 'width: 300px; height: 300px; margin: 20px auto; border: 2px solid #ddd; border-radius: 8px; display: block;';

  if (qrcodeImagem) {
    qrImg.src = qrcodeImagem.startsWith('data:') ? qrcodeImagem : `data:image/png;base64,${qrcodeImagem}`;
  } else if (pixCopiaECola) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopiaECola)}`;
  } else if (qrcodeLegacy) {
    qrImg.src = qrcodeLegacy.startsWith('data:') || qrcodeLegacy.startsWith('http')
      ? qrcodeLegacy
      : `data:image/png;base64,${qrcodeLegacy}`;
  }

  const copiaColaEl = document.createElement('div');
  if (pixCopiaECola) {
    copiaColaEl.style.cssText = 'margin: 12px 0; padding: 12px; background: #f5f5f5; border-radius: 8px; word-break: break-all; font-size: 11px; color: #555;';
    copiaColaEl.textContent = pixCopiaECola;

    const btnCopiar = document.createElement('button');
    btnCopiar.textContent = '📋 Copiar PIX Copia e Cola';
    btnCopiar.onclick = () => navigator.clipboard.writeText(pixCopiaECola).then(() => mostrarAviso('Código copiado!'));
    btnCopiar.style.cssText = 'background: #2196F3; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 8px; font-size: 14px;';
    copiaColaEl.appendChild(document.createElement('br'));
    copiaColaEl.appendChild(btnCopiar);
  }

  const instrucoes = document.createElement('p');
  instrucoes.textContent = 'Escaneie o QR Code ou copie o código PIX abaixo';
  instrucoes.style.cssText = 'color: #999; margin: 20px 0; font-size: 14px;';

  // Countdown de expiração
  const expiraEmMs = parseValidadePix(validadeEm, expiracaoSegundos);
  let segundos = Math.max(0, Math.round((expiraEmMs - Date.now()) / 1000));
  const countdown = document.createElement('div');
  countdown.id = 'countdown-pix';
  countdown.textContent = formatCountdownPix(segundos);
  countdown.style.cssText = 'color: #ff6b6b; font-weight: bold; margin: 16px 0;';

  // Botão de verificação manual
  const btnVerificar = document.createElement('button');
  btnVerificar.textContent = '🔄 Verificar Pagamento';
  btnVerificar.onclick = () => verificarPagamentoPixManualmente(txid);
  btnVerificar.style.cssText = `
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    margin-top: 16px;
  `;

  // Botão de cancelar
  const btnCancelar = document.createElement('button');
  btnCancelar.textContent = '❌ Cancelar';
  btnCancelar.onclick = fecharTelaQrCode;
  btnCancelar.style.cssText = `
    background: #f44336;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    margin-left: 8px;
    margin-top: 16px;
  `;

  // Montar
  content.appendChild(title);
  content.appendChild(valorEl);
  content.appendChild(qrImg);
  if (pixCopiaECola) content.appendChild(copiaColaEl);
  content.appendChild(instrucoes);
  content.appendChild(countdown);
  content.appendChild(btnVerificar);
  content.appendChild(btnCancelar);

  container.appendChild(content);
  document.body.appendChild(container);

  // Atualizar countdown a cada segundo
  if (pixCountdownTimer) clearInterval(pixCountdownTimer);
  pixCountdownTimer = setInterval(() => {
    segundos = Math.max(0, Math.round((expiraEmMs - Date.now()) / 1000));
    const el = document.getElementById('countdown-pix');
    if (el) el.textContent = formatCountdownPix(segundos);
    if (segundos <= 0) {
      clearInterval(pixCountdownTimer);
      pixCountdownTimer = null;
      fecharTelaQrCode();
      mostrarAviso('QR Code expirou');
    }
  }, 1000);
}

// ── SEÇÃO 7: Fechar Tela de QR Code ──────────────────────────────────────
function fecharTelaQrCode() {
  const modal = document.getElementById('modal-qrcode-pix');
  if (modal) modal.remove();
  pixAtivo = false;
  pixValorReaisAtual = null;
  pixComandaIdAtual = null;
  if (pixUnsubscribe) pixUnsubscribe();
  if (pixVerificacaoTimer) clearInterval(pixVerificacaoTimer);
  if (pixCountdownTimer) {
    clearInterval(pixCountdownTimer);
    pixCountdownTimer = null;
  }
  atualizarInfoPix();
}

// ── SEÇÃO 8-9: Callback após confirmação do PIX Efi ──────────────────────
async function onPagamentoConfirmado(comanda, valorFallback) {
  console.log('PIX Efi confirmado para comanda:', comanda?.id);
  pixValorReaisAtual = null;
  beepOk();
  await fecharComandaComPagamento();
}

// ── SEÇÃO 10: Funções Auxiliares UI ──────────────────────────────────────
function mostrarLoading(mensagem = 'Processando...') {
  let loader = document.getElementById('loader-pix');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loader-pix';
    loader.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 32px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      z-index: 9998;
      text-align: center;
    `;
    document.body.appendChild(loader);
  }
  loader.innerHTML = `
    <div style="margin-bottom: 16px;">
      <svg style="animation: spin 1s linear infinite; width: 40px; height: 40px; color: #4CAF50;"
           viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="2" opacity="0.3"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <div style="font-size: 16px; color: #333;">${mensagem}</div>
    <style>
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    </style>
  `;
}

function fecharLoading() {
  const loader = document.getElementById('loader-pix');
  if (loader) loader.remove();
}

function mostrarAviso(mensagem) {
  // Toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ff9800;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = mensagem;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

