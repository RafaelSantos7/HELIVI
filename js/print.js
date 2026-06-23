// print.js — HELIVI
function imprimirCupom(pedido) {
  const nome = localStorage.getItem("nomeEstab") || "HELIVI";
  const msg = localStorage.getItem("msgFinal") || "Obrigado pela preferência!";
  const data = fmtData(pedido.createdAt || new Date());
  const itens = (pedido.itens || [])
    .map(
      (i) => `
    <tr>
      <td style="padding:3px 0;vertical-align:top">${i.nome}${i.obs ? `<br><span style="font-size:10px;color:#777;font-style:italic">${i.obs}</span>` : ""}</td>
      <td style="text-align:center;padding:3px 4px;white-space:nowrap">${i.quantidade}x</td>
      <td style="text-align:right;padding:3px 0;white-space:nowrap">${fmtR(i.preco * i.quantidade)}</td>
    </tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm;color:#000}
  h1{font-size:14px;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:1px}
  .c{text-align:center}.s{font-size:10px;color:#555}hr{border:none;border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}.tot{display:flex;justify-content:space-between;font-weight:bold;font-size:13px;margin:5px 0}
  .rod{text-align:center;font-size:10px;margin-top:8px}@media print{body{width:80mm}@page{margin:0;size:80mm auto}}</style>
  </head><body>
  <h1>${nome}</h1><p class="c s">${data}</p>
  <p class="c s">Pedido #${pedido.numeroPedido || pedido.id?.slice(-6).toUpperCase()}</p>
  ${pedido.cliente ? `<p class="c s">Cliente: <b>${pedido.cliente}</b></p>` : ""}
  ${pedido.mesa ? `<p class="c s">Mesa: <b>${pedido.mesa}</b></p>` : ""}
  ${pedido.obsGeral ? `<p class="s" style="margin:4px 0;font-style:italic">Obs: ${pedido.obsGeral}</p>` : ""}
  <hr><table><thead><tr><th style="text-align:left">Item</th><th>Qtd</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>${itens}</tbody></table><hr>
  <div class="tot"><span>TOTAL</span><span>${fmtR(pedido.total)}</span></div>
  <p class="s">Pagamento: <b>${pedido.pagamento || ""}</b></p>
  ${pedido.cartao1 ? `<p class="s">Cartão 1: ${fmtR(pedido.cartao1)} / Cartão 2: ${fmtR(pedido.cartao2 || 0)}</p>` : ""}
  <hr><div class="rod">${msg}</div></body></html>`;
  const w = window.open("", "_blank", "width=380,height=560");
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.print();
    w.close();
  }, 450);
}

function enviarWhatsApp(pedido, tel) {
  const nome = localStorage.getItem("nomeEstab") || "HELIVI";
  let m = `🍔 *${nome}*\n📅 ${fmtData(pedido.createdAt || new Date())}\n`;
  if (pedido.cliente) m += `👤 ${pedido.cliente}\n`;
  if (pedido.mesa) m += `🪑 Mesa ${pedido.mesa}\n`;
  if (pedido.obsGeral) m += `📝 ${pedido.obsGeral}\n`;
  m += `─────────────\n`;
  (pedido.itens || []).forEach((i) => {
    m += `${i.quantidade}x ${i.nome} — ${fmtR(i.preco * i.quantidade)}\n`;
    if (i.obs) m += `   _${i.obs}_\n`;
  });
  m += `─────────────\n*Total: ${fmtR(pedido.total)}*\n💳 ${pedido.pagamento || ""}\n\nObrigado! 😊`;
  const n = (tel || "").replace(/\D/g, "");
  window.open(
    `https://api.whatsapp.com/send?${n ? "phone=55" + n + "&" : ""}text=${encodeURIComponent(m)}`,
    "_blank",
  );
}
