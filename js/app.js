/*
 * Aplicação principal (RBAC + telas). Depende de calculo.js,
 * calculo-ferias.js, calculo-rescisao.js, firebase-config.js, auth.js e
 * db.js (todos carregados antes deste arquivo no index.html).
 */
(function () {
"use strict";

var MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
var PERFIL_LABEL = { super_admin: "Super Admin", admin: "Admin / RH", funcionario: "Funcionário" };
var STATUS_LABEL = { EM_ANDAMENTO: "Em andamento", DISPONIVEL: "Disponível", VENCENDO: "Vencendo", VENCIDO: "Vencido", GOZADO: "Já gozado" };

// -------------------- estado em memória (espelha o Firestore) --------------------
var colaboradores = [];
var registros = [];
var ajustes = [];
var feriasGozos = [];
var prestadoresPJ = [];
var pjPeriodos = [];
var ajustesSalariais = []; // histórico de mudanças de salário do CLT (colaborador em edição)
var ajustesHonorarioPJ = []; // histórico de mudanças de honorário do PJ (prestador em edição)
var listaUsuarios = [];

var editandoRegistroId = null;
var editandoEmpId = null;
var editandoAjusteId = null;
var editandoPjId = null;
var confirmAction = null;

function el(id) { return document.getElementById(id); }

// ==========================================================================
// AUTENTICAÇÃO / TELA INICIAL
// ==========================================================================
function mostrarTela(nome) {
  el("loginScreen").style.display = nome === "login" ? "flex" : "none";
  el("semAcessoScreen").style.display = nome === "semAcesso" ? "flex" : "none";
  el("trocarSenhaScreen").style.display = nome === "trocarSenha" ? "flex" : "none";
  el("appShell").style.display = nome === "app" ? "block" : "none";
}

var appIniciado = false;

function entrarNoApp() {
  mostrarTela("app");
  aplicarRBACNaInterface();
  if (!appIniciado) { appIniciado = true; iniciarApp(); }
}

onAuthPronto(function (resultado) {
  if (!resultado) { mostrarTela("login"); appIniciado = false; return; }
  if (resultado.semPerfil || resultado.inativo) {
    el("semAcessoTexto").textContent = resultado.inativo
      ? "Esta conta foi desativada. Fale com quem administra o sistema (Super Admin) para reativar."
      : "Este login não tem um perfil cadastrado no sistema. Fale com quem administra o sistema (Super Admin) para liberar seu acesso.";
    mostrarTela("semAcesso");
    return;
  }
  if (resultado.senhaProvisoria) { mostrarTela("trocarSenha"); return; }
  entrarNoApp();
});

el("trocarSenhaForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var nova = el("novaSenha").value;
  var confirmar = el("confirmarNovaSenha").value;
  var erroBox = el("trocarSenhaError");
  var btn = el("btnTrocarSenha");
  if (nova.length < 6) { erroBox.hidden = false; erroBox.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }
  if (nova !== confirmar) { erroBox.hidden = false; erroBox.textContent = "As senhas não coincidem."; return; }
  erroBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "Salvando...";
  trocarSenhaObrigatoria(nova).then(function () {
    showToast("Senha definida com sucesso.");
    entrarNoApp();
  }).catch(function (err) {
    erroBox.hidden = false;
    var msg = "Não foi possível trocar a senha: " + (err && err.message || "");
    if (err && err.code === "auth/requires-recent-login") msg = "Por segurança, saia e entre de novo com a senha padrão antes de trocar.";
    erroBox.textContent = msg;
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = "Definir nova senha";
  });
});

el("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var email = el("loginEmail").value.trim();
  var senha = el("loginSenha").value;
  var erroBox = el("loginError");
  var btn = el("btnLogin");
  erroBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "Entrando...";
  fazerLogin(email, senha).catch(function (err) {
    var msg = "Não foi possível entrar. Confira o e-mail e a senha.";
    if (err && (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential")) msg = "E-mail ou senha incorretos.";
    if (err && err.code === "auth/invalid-email") msg = "E-mail inválido.";
    if (err && err.code === "auth/too-many-requests") msg = "Muitas tentativas. Aguarde um pouco e tente de novo.";
    erroBox.textContent = msg;
    erroBox.hidden = false;
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = "Entrar";
  });
});
el("btnLogout").addEventListener("click", function () { fazerLogout(); });
el("btnSairSemAcesso").addEventListener("click", function () { fazerLogout(); });

// ------------------------- Alternância de tema (claro/escuro) -------------------------
(function () {
  var btnTheme = el("btnTheme");
  if (!btnTheme) return;
  var iconMoon = el("themeIconMoon"), iconSun = el("themeIconSun"), label = el("themeLabel");
  function atualizarBotao() {
    var escuro = document.documentElement.getAttribute("data-theme") === "dark";
    iconMoon.hidden = escuro;
    iconSun.hidden = !escuro;
    label.textContent = escuro ? "Modo claro" : "Modo escuro";
  }
  atualizarBotao();
  btnTheme.addEventListener("click", function () {
    var escuro = document.documentElement.getAttribute("data-theme") === "dark";
    if (escuro) {
      document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("rhTema", "light"); } catch (e) {}
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("rhTema", "dark"); } catch (e) {}
    }
    atualizarBotao();
  });
})();

function aplicarRBACNaInterface() {
  el("userNome").textContent = usuarioAtual.nome;
  el("userPerfilBadgeWrap").innerHTML = '<span class="perfil-badge ' + usuarioAtual.perfil + '">' + PERFIL_LABEL[usuarioAtual.perfil] + "</span>";
  el("pjGlobalBanner").style.display = ehSuperAdmin() ? "flex" : "none";

  document.querySelectorAll(".tab-btn[data-perfis]").forEach(function (btn) {
    var permitido = btn.dataset.perfis.split(",").indexOf(usuarioAtual.perfil) !== -1;
    btn.hidden = !permitido;
  });

  // Funcionário não escolhe "de quem" é o registro/ajuste/férias — é sempre
  // o próprio colaborador vinculado. Isso é só conforto de tela; quem
  // garante de verdade é a regra do Firestore (js/../rules/firestore.rules).
  var soLeituraPropria = !ehAdminOuSuperAdmin();
  [el("campoFuncionarioPonto"), el("campoFiltroFuncionario")].forEach(function (campo) {
    if (campo) campo.style.display = soLeituraPropria ? "none" : "flex";
  });
  el("feriasFiltroWrap").style.display = soLeituraPropria ? "none" : "flex";
  el("feriasGozoWrap").style.display = ehAdminOuSuperAdmin() ? "block" : "none";

  // O alternador CLT/PJ só existe pra quem enxerga dados de PJ (Super Admin).
  el("feriasRegimeToggle").hidden = !ehSuperAdmin();
  el("rescisaoRegimeToggle").hidden = !ehSuperAdmin();
}

// ==========================================================================
// CARREGAMENTO DE DADOS (respeitando o perfil)
// ==========================================================================
function iniciarApp() {
  el("data").value = new Date().toISOString().slice(0, 10);
  el("ajData").value = new Date().toISOString().slice(0, 10);
  limparFormularioRegistro();
  limparFormularioEmp();
  limparFormularioAjuste();
  limparFormularioPj();
  montarSelectAvisoPrevio();
  popularMeses();
  carregarTudo(false);

  document.querySelectorAll(".tab-btn[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () { irParaView(btn.dataset.view); });
  });
  el("btnRefresh").addEventListener("click", function () { carregarTudo(true); });
}

function carregarTudo(mostrarToast) {
  setSync("syncing");
  var promessaColaboradores, promessaRegistros, promessaAjustes, promessaGozos;

  if (ehAdminOuSuperAdmin()) {
    promessaColaboradores = listarColaboradores();
    promessaRegistros = listarRegistros();
    promessaAjustes = listarAjustes();
    promessaGozos = listarFeriasGozos();
  } else {
    var meuId = usuarioAtual.colaboradorId;
    promessaColaboradores = meuId ? obterColaborador(meuId).then(function (c) { return c ? [c] : []; }) : Promise.resolve([]);
    promessaRegistros = meuId ? listarRegistros(meuId) : Promise.resolve([]);
    promessaAjustes = meuId ? listarAjustes(meuId) : Promise.resolve([]);
    promessaGozos = meuId ? listarFeriasGozos(meuId) : Promise.resolve([]);
  }

  return Promise.all([promessaColaboradores, promessaRegistros, promessaAjustes, promessaGozos])
    .then(function (results) {
      colaboradores = results[0];
      registros = results[1];
      ajustes = results[2];
      feriasGozos = results[3];
      popularSelectsColaboradores();
      popularAnos();
      renderTudo();
      setSync("ok");
      if (mostrarToast) showToast("Dados atualizados.");
    })
    .catch(function (err) {
      console.error(err);
      setSync("error");
      showToast("Não foi possível carregar os dados. " + (err && err.message ? err.message : ""));
    });
}

function renderTudo() {
  renderDashboard();
  renderHistorico();
  renderRelatorio();
  renderAdminList();
  renderAjustes();
  renderFerias();
  popularAnos();
}

function getColaborador(id) {
  for (var i = 0; i < colaboradores.length; i++) if (colaboradores[i].id === id) return colaboradores[i];
  return null;
}

// ==========================================================================
// NAVEGAÇÃO ENTRE ABAS
// ==========================================================================
function irParaView(viewId) {
  document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("is-active", v.id === viewId); });
  document.querySelectorAll(".tab-btn").forEach(function (t) { t.classList.toggle("is-active", t.dataset.view === viewId); });
  if (viewId === "historico") renderHistorico();
  if (viewId === "dashboard") renderDashboard();
  if (viewId === "relatorio") renderRelatorio();
  if (viewId === "colaboradores") renderAdminList();
  if (viewId === "ajustes") renderAjustes();
  if (viewId === "ferias") renderFerias();
  if (viewId === "pj" && ehSuperAdmin()) carregarPJ();
  if (viewId === "usuarios" && ehSuperAdmin()) carregarUsuarios();
}

// ==========================================================================
// TOAST / MODAL / SYNC (mesmos padrões do site anterior)
// ==========================================================================
var toastTimer = null;
function showToast(msg) {
  el("toast").textContent = msg;
  el("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el("toast").classList.remove("show"); }, 2800);
}
function abrirConfirmacao(titulo, texto, onOk) {
  el("confirmTitle").textContent = titulo;
  el("confirmText").textContent = texto;
  confirmAction = onOk;
  el("confirmModal").classList.remove("hidden");
}
function fecharConfirmacao() { confirmAction = null; el("confirmModal").classList.add("hidden"); }
el("confirmCancel").addEventListener("click", fecharConfirmacao);
el("confirmModal").addEventListener("click", function (e) { if (e.target === el("confirmModal")) fecharConfirmacao(); });
el("confirmOk").addEventListener("click", function () { var fn = confirmAction; fecharConfirmacao(); if (fn) fn(); });

function setSync(state) {
  var dot = el("syncDot"), label = el("syncLabel");
  if (state === "syncing") { dot.className = "sync-dot syncing"; label.textContent = "sincronizando..."; }
  else if (state === "error") { dot.className = "sync-dot"; dot.style.background = "var(--negative)"; label.textContent = "erro ao sincronizar"; }
  else { dot.className = "sync-dot"; dot.style.background = "var(--positive)"; label.textContent = "sincronizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
}

// ==========================================================================
// SELECTS AUXILIARES
// ==========================================================================
function popularSelectsColaboradores() {
  var principais = [el("funcionario"), el("ajFuncionario"), el("gozoFuncionario"), el("rescFuncionario")];
  var todos = [el("funcionario"), el("filtroFuncionario"), el("relFuncionario"), el("ajFuncionario"), el("feriasFuncionario"), el("gozoFuncionario"), el("rescFuncionario")];
  todos.forEach(function (select) {
    if (!select) return;
    var valorAtual = select.value;
    var isPrincipal = principais.indexOf(select) !== -1;
    select.innerHTML = isPrincipal ? '<option value="" disabled selected>Selecione</option>' : '<option value="">Todos</option>';
    colaboradores.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.nome;
      select.appendChild(opt);
    });
    if (!isPrincipal) select.value = valorAtual;
  });

  if (!ehAdminOuSuperAdmin() && usuarioAtual.colaboradorId) {
    [el("funcionario"), el("ajFuncionario"), el("gozoFuncionario")].forEach(function (s) { if (s) s.value = usuarioAtual.colaboradorId; });
  }

  var colabSelectUsuario = el("usrColaborador");
  if (colabSelectUsuario) {
    colabSelectUsuario.innerHTML = '<option value="">—</option>';
    colaboradores.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.nome;
      colabSelectUsuario.appendChild(opt);
    });
  }
}
function popularMeses() {
  [el("filtroMes"), el("relMes")].forEach(function (select) {
    if (select.dataset.filled) return;
    MESES.forEach(function (nome, idx) {
      var opt = document.createElement("option");
      opt.value = String(idx + 1).padStart(2, "0");
      opt.textContent = nome;
      select.appendChild(opt);
    });
    select.dataset.filled = "1";
  });
}
function popularAnos() {
  var anos = {};
  registros.forEach(function (r) { anos[r.data.slice(0, 4)] = true; });
  anos[String(new Date().getFullYear())] = true;
  var anosOrdenados = Object.keys(anos).sort(function (a, b) { return b - a; });
  [el("filtroAno"), el("relAno")].forEach(function (select) {
    var atual = select.value;
    select.innerHTML = '<option value="">Todos</option>';
    anosOrdenados.forEach(function (ano) {
      var opt = document.createElement("option");
      opt.value = ano; opt.textContent = ano;
      select.appendChild(opt);
    });
    select.value = atual;
  });
}

// ==========================================================================
// DASHBOARD
// ==========================================================================
// Períodos aquisitivos com status VENCIDO (concessivo já passou) ou
// VENCENDO (dentro do prazo de alerta) para cada colaborador — usados no
// aviso do Painel e no contador da aba Férias. CLT (art. 137): férias
// concedidas depois do período concessivo têm que ser pagas em dobro, então
// isso não é só um detalhe estético — é um risco financeiro real de deixar
// passar.
function calcularAlertasFerias() {
  var hoje = new Date().toISOString().slice(0, 10);
  var alertas = [];
  colaboradores.forEach(function (c) {
    if (!c.dataAdmissao) return;
    var gozosDoColab = feriasGozos.filter(function (g) { return g.colaboradorId === c.id; });
    var periodos = periodosAquisitivos(c, hoje, gozosDoColab);
    var vencidos = periodos.filter(function (p) { return p.status === "VENCIDO"; });
    var vencendo = periodos.filter(function (p) { return p.status === "VENCENDO"; });
    if (vencidos.length || vencendo.length) alertas.push({ colaborador: c, vencidos: vencidos, vencendo: vencendo });
  });
  return alertas;
}

function renderAlertaFerias() {
  var alertas = calcularAlertasFerias();
  var totalVencidos = alertas.reduce(function (s, a) { return s + a.vencidos.length; }, 0);
  var totalVencendo = alertas.reduce(function (s, a) { return s + a.vencendo.length; }, 0);

  var badge = el("feriasTabBadge");
  var totalBadge = totalVencidos + totalVencendo;
  badge.hidden = totalBadge === 0;
  badge.textContent = String(totalBadge);

  var box = el("dashboardFeriasAlerta");
  if (alertas.length === 0) { box.style.display = "none"; return; }
  var itens = alertas.map(function (a) {
    var partes = [];
    if (a.vencidos.length) {
      var diasVencidos = a.vencidos.reduce(function (s, p) { return s + p.saldo; }, 0);
      partes.push('<strong style="color:var(--negative)">' + a.vencidos.length + ' período(s) vencido(s)</strong> (' + diasVencidos + ' dia(s) pendente(s) — sujeito a pagamento em dobro se concedido agora, CLT art. 137)');
    }
    if (a.vencendo.length) {
      partes.push(a.vencendo.length + ' período(s) vencendo em breve');
    }
    return "<li><strong>" + a.colaborador.nome + "</strong> — " + partes.join(" · ") + "</li>";
  }).join("");
  box.style.display = "flex";
  box.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" width="18" height="18" style="flex:0 0 auto;margin-top:1px"><path d="M12 9v4m0 4h.01M12 2 2 20h20L12 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
    '<div><strong>Atenção — férias pendentes:</strong><ul style="margin:6px 0 0;padding-left:18px;">' + itens + '</ul></div>';
}

function renderDashboard() {
  el("dashboardSub").textContent = ehAdminOuSuperAdmin()
    ? "Saldo consolidado do banco de horas por colaborador."
    : "Seu saldo consolidado do banco de horas.";
  renderAlertaFerias();
  var mapa = agregarPorColaborador(colaboradores, registros, ajustes);
  var wrap = el("dashboardCards");
  if (colaboradores.length === 0) {
    wrap.innerHTML = '<p class="empty-dashboard">' + (ehAdminOuSuperAdmin() ? 'Nenhum colaborador cadastrado ainda. Vá até a aba <strong>Colaboradores</strong> para adicionar o primeiro.' : 'Seu cadastro de colaborador ainda não foi vinculado a esta conta. Fale com o RH.') + '</p>';
    return;
  }
  var grid = document.createElement("div");
  grid.className = "cards-grid";
  colaboradores.forEach(function (c) {
    var stats = mapa[c.id] || { positivo: 0, negativo: 0, ajustes: 0, dias: 0 };
    var saldoFinal = stats.positivo - stats.negativo + stats.ajustes;
    var corSaldo = saldoFinal > 0 ? "var(--positive)" : saldoFinal < 0 ? "var(--negative)" : "var(--neutral)";
    var ajustesLinha = stats.ajustes !== 0
      ? '<div class="emp-stat"><strong style="color:' + (stats.ajustes > 0 ? "var(--positive)" : "var(--negative)") + '">' + minutesToSignedHHMM(stats.ajustes) + '</strong>Ajustes lançados</div>'
      : '';
    var card = document.createElement("div");
    card.className = "emp-card";
    card.innerHTML =
      '<div class="emp-dial" style="color:' + corSaldo + '"><span class="emp-dial-value" style="color:' + corSaldo + '">' + minutesToSignedHHMM(saldoFinal) + '</span></div>' +
      '<div class="emp-body">' +
        '<h3>' + c.nome + (c.cargo ? ' <small style="color:var(--ink-faint);font-weight:400;">· ' + c.cargo + '</small>' : '') + '</h3>' +
        '<div class="emp-meta">Jornada: ' + minutesToHHMM(jornadaMinutos(c)) + ' · ' + diasResumo(c.dias) + ' · ' + stats.dias + ' dia(s) registrado(s)</div>' +
        '<div class="emp-stats">' +
          '<div class="emp-stat positive"><strong>' + minutesToHHMM(stats.positivo) + '</strong>Banco positivo</div>' +
          '<div class="emp-stat negative"><strong>' + minutesToHHMM(stats.negativo) + '</strong>Banco negativo</div>' +
          ajustesLinha +
          '<div class="emp-stat"><strong style="color:' + corSaldo + '">' + minutesToSignedHHMM(saldoFinal) + '</strong>Saldo final</div>' +
        '</div>' +
      '</div>';
    grid.appendChild(card);
  });
  wrap.innerHTML = "";
  wrap.appendChild(grid);
}

// ==========================================================================
// REGISTRAR PONTO
// ==========================================================================
var camposHorario = [el("entrada"), el("saidaAlmoco"), el("retornoAlmoco"), el("saida")];
function colaboradorSelecionadoPonto() { return ehAdminOuSuperAdmin() ? el("funcionario").value : usuarioAtual.colaboradorId; }

function atualizarPreview() {
  var colabId = colaboradorSelecionadoPonto();
  var preenchidos = camposHorario.every(function (c) { return c.value; });
  if (!colabId || !preenchidos) { el("previewBox").hidden = true; return; }
  var erro = validarHorarios(el("entrada").value, el("saidaAlmoco").value, el("retornoAlmoco").value, el("saida").value);
  if (erro) { el("previewBox").hidden = true; el("formError").hidden = false; el("formError").textContent = erro; return; }
  el("formError").hidden = true;
  var colaborador = getColaborador(colabId);
  var regTemp = { data: el("data").value || "2026-01-05", entrada: el("entrada").value, saidaAlmoco: el("saidaAlmoco").value, retornoAlmoco: el("retornoAlmoco").value, saida: el("saida").value };
  var calc = calcularRegistro(regTemp, colaborador);
  el("previewBox").hidden = false;
  el("prevTrabalhadas").textContent = minutesToHHMM(calc.trabalhadas);
  el("prevJornada").textContent = calc.diaUtil ? minutesToHHMM(calc.jornadaEsperada) : "00:00 (não é dia de trabalho)";
  el("prevSaldo").textContent = minutesToSignedHHMM(calc.saldo);
  el("prevSaldo").style.color = calc.saldo > 0 ? "var(--positive)" : calc.saldo < 0 ? "var(--negative)" : "var(--ink)";
}
[el("funcionario"), el("data")].concat(camposHorario).forEach(function (campo) {
  campo.addEventListener("input", atualizarPreview);
  campo.addEventListener("change", atualizarPreview);
});

function limparFormularioRegistro() {
  el("pontoForm").reset();
  el("registroId").value = "";
  editandoRegistroId = null;
  el("formTitle").textContent = "Registrar ponto";
  el("cancelEdit").hidden = true;
  el("previewBox").hidden = true;
  el("formError").hidden = true;
  el("data").value = new Date().toISOString().slice(0, 10);
  if (!ehAdminOuSuperAdmin() && usuarioAtual) el("funcionario").value = usuarioAtual.colaboradorId;
}
el("cancelEdit").addEventListener("click", limparFormularioRegistro);
el("pontoForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var colabId = colaboradorSelecionadoPonto();
  var reg = {
    id: editandoRegistroId || undefined,
    colaboradorId: colabId,
    data: el("data").value,
    entrada: el("entrada").value,
    saidaAlmoco: el("saidaAlmoco").value,
    retornoAlmoco: el("retornoAlmoco").value,
    saida: el("saida").value,
  };
  if (!reg.colaboradorId || !reg.data) { el("formError").hidden = false; el("formError").textContent = "Selecione o colaborador e a data do registro."; return; }
  var erro = validarHorarios(reg.entrada, reg.saidaAlmoco, reg.retornoAlmoco, reg.saida);
  if (erro) { el("formError").hidden = false; el("formError").textContent = erro; return; }
  el("formError").hidden = true;
  el("btnSalvarRegistro").disabled = true;
  setSync("syncing");
  var foiEdicao = !!editandoRegistroId;
  salvarRegistro(reg).then(function () {
    setSync("ok");
    showToast(foiEdicao ? "Registro atualizado." : "Ponto registrado com sucesso.");
    limparFormularioRegistro();
    return carregarTudo(false);
  }).then(function () {
    irParaView("historico");
  }).catch(function (err) {
    console.error(err);
    setSync("error");
    showToast("Não foi possível salvar: " + (err && err.message ? err.message : "verifique sua conexão."));
  }).finally(function () { el("btnSalvarRegistro").disabled = false; });
});
function editarRegistro(id) {
  var reg = registros.filter(function (r) { return r.id === id; })[0];
  if (!reg) return;
  editandoRegistroId = id;
  el("registroId").value = id;
  if (ehAdminOuSuperAdmin()) el("funcionario").value = reg.colaboradorId;
  el("data").value = reg.data;
  el("entrada").value = reg.entrada;
  el("saidaAlmoco").value = reg.saidaAlmoco;
  el("retornoAlmoco").value = reg.retornoAlmoco;
  el("saida").value = reg.saida;
  var c = getColaborador(reg.colaboradorId);
  el("formTitle").textContent = "Editando registro — " + (c ? c.nome : "?") + " (" + formatDateBR(reg.data) + ")";
  el("cancelEdit").hidden = false;
  atualizarPreview();
  irParaView("registro");
}
function formatDateBR(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }

// -------------------- Valor em R$ no formato brasileiro --------------------
// Os campos de salário/honorário eram <input type="number">, que só aceita
// PONTO como separador decimal e não entende ponto de milhar — então
// digitar "6.000" pensando em "seis mil" virava 6 (seis) ao salvar, porque
// o navegador lia o ponto como decimal. Agora são campos de texto livres
// (a pessoa digita do jeito que já costuma: "6.000", "6000" ou "6000,50")
// e a gente interpreta certo ao sair do campo/salvar: vírgula é sempre
// decimal, ponto é sempre separador de milhar (nunca decimal) — é assim
// que se escreve valor em R$ no Brasil.
function moedaParaNumero(valorDigitado) {
  if (!valorDigitado) return 0;
  var limpo = String(valorDigitado).trim().replace(/[^\d.,]/g, "");
  if (limpo.indexOf(",") !== -1) {
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    limpo = limpo.replace(/\./g, "");
  }
  var n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}
function numeroParaMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Ao sair do campo, reformata pro padrão R$ 6.000,00 — assim a pessoa vê na
// hora se o sistema entendeu o valor do jeito certo, antes mesmo de salvar.
["empSalario", "pjValor", "ajusteSalarialValor", "ajusteHonorarioValor"].forEach(function (id) {
  var input = el(id);
  input.setAttribute("inputmode", "decimal");
  input.addEventListener("blur", function () {
    if (!input.value.trim()) return;
    var numero = moedaParaNumero(input.value);
    input.value = numero ? numeroParaMoeda(numero) : "";
  });
});

// ==========================================================================
// HISTÓRICO
// ==========================================================================
function obterFiltros(prefixo) {
  if (prefixo === "historico") return { colaboradorId: ehAdminOuSuperAdmin() ? el("filtroFuncionario").value : usuarioAtual.colaboradorId, mes: el("filtroMes").value, ano: el("filtroAno").value };
  return { colaboradorId: ehAdminOuSuperAdmin() ? el("relFuncionario").value : usuarioAtual.colaboradorId, mes: el("relMes").value, ano: el("relAno").value };
}
function aplicarFiltros(lista, filtros) {
  return lista.filter(function (r) {
    if (filtros.colaboradorId && r.colaboradorId !== filtros.colaboradorId) return false;
    if (filtros.ano && r.data.indexOf(filtros.ano) !== 0) return false;
    if (filtros.mes && r.data.slice(5, 7) !== filtros.mes) return false;
    return true;
  });
}
function renderHistorico() {
  var filtros = obterFiltros("historico");
  var lista = aplicarFiltros(registros, filtros).slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  var body = el("historicoBody");
  body.innerHTML = "";
  el("historicoVazio").hidden = lista.length !== 0;
  lista.forEach(function (reg) {
    var colaborador = getColaborador(reg.colaboradorId);
    var calc = calcularRegistro(reg, colaborador);
    var tr = document.createElement("tr");
    var saldoClasse = calc.saldo > 0 ? "pos" : calc.saldo < 0 ? "neg" : "zero";
    var nomeExibicao = colaborador ? colaborador.nome : "(colaborador removido)";
    var acoes = ehAdminOuSuperAdmin()
      ? '<div class="row-actions">' +
        '<button class="btn-icon" data-action="editar" data-id="' + reg.id + '" title="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
        '<button class="btn-icon danger" data-action="excluir" data-id="' + reg.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '</div>' : '';
    tr.innerHTML =
      '<td>' + formatDateBR(reg.data) + (calc.diaUtil ? "" : ' <small style="color:var(--ink-faint)">(fora da jornada)</small>') + '</td>' +
      '<td>' + nomeExibicao + '</td>' +
      '<td>' + reg.entrada + '</td><td>' + reg.saidaAlmoco + '</td><td>' + reg.retornoAlmoco + '</td><td>' + reg.saida + '</td>' +
      '<td>' + minutesToHHMM(calc.trabalhadas) + '</td>' +
      '<td><span class="badge-saldo ' + saldoClasse + '">' + minutesToSignedHHMM(calc.saldo) + '</span></td>' +
      '<td><small style="color:var(--ink-faint);">' + (reg.atualizadoPorNome || reg.criadoPorNome || '—') + '</small></td>' +
      '<td>' + acoes + '</td>';
    body.appendChild(tr);
  });
}
el("historicoBody").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action]");
  if (!btn) return;
  var id = btn.dataset.id;
  if (btn.dataset.action === "editar") editarRegistro(id);
  if (btn.dataset.action === "excluir") excluirRegistroUI(id);
});
[el("filtroFuncionario"), el("filtroMes"), el("filtroAno")].forEach(function (s) { s.addEventListener("change", renderHistorico); });
el("limparFiltros").addEventListener("click", function () { el("filtroFuncionario").value = ""; el("filtroMes").value = ""; el("filtroAno").value = ""; renderHistorico(); });

function excluirRegistroUI(id) {
  abrirConfirmacao("Excluir registro?", "Essa ação não pode ser desfeita.", function () {
    setSync("syncing");
    db.collection("registros").doc(id).delete().then(function () {
      setSync("ok"); showToast("Registro excluído."); return carregarTudo(false);
    }).catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível excluir: " + (err && err.message || "")); });
  });
}

// ==========================================================================
// RELATÓRIO
// ==========================================================================
function renderRelatorio() {
  var filtros = obterFiltros("relatorio");
  var listaReg = aplicarFiltros(registros, filtros);
  var listaAj = aplicarFiltros(ajustes, filtros);
  var mapa = agregarPorColaborador(colaboradores, listaReg, listaAj);
  var body = el("relatorioBody");
  body.innerHTML = "";
  var algum = false;
  colaboradores.forEach(function (c) {
    if (filtros.colaboradorId && filtros.colaboradorId !== c.id) return;
    var stats = mapa[c.id] || { positivo: 0, negativo: 0, ajustes: 0, dias: 0 };
    var saldoFinal = stats.positivo - stats.negativo + stats.ajustes;
    var saldoClasse = saldoFinal > 0 ? "pos" : saldoFinal < 0 ? "neg" : "zero";
    algum = true;
    var tr = document.createElement("tr");
    tr.innerHTML = '<td><strong>' + c.nome + '</strong></td><td>' + minutesToHHMM(stats.positivo) + '</td><td>' + minutesToHHMM(stats.negativo) + '</td><td>' + minutesToSignedHHMM(stats.ajustes) + '</td><td><span class="badge-saldo ' + saldoClasse + '">' + minutesToSignedHHMM(saldoFinal) + '</span></td><td>' + stats.dias + '</td>';
    body.appendChild(tr);
  });
  if (!algum) body.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum dado para os filtros selecionados.</td></tr>';
  var partes = [];
  if (filtros.colaboradorId) { var c = getColaborador(filtros.colaboradorId); if (c) partes.push(c.nome); }
  if (filtros.mes) partes.push(MESES[parseInt(filtros.mes, 10) - 1]);
  if (filtros.ano) partes.push(filtros.ano);
  el("reportPeriodo").textContent = partes.length ? "Período: " + partes.join(" · ") : "Período: todos os registros";
  el("reportEmitido").textContent = new Date().toLocaleString("pt-BR");
}
[el("relFuncionario"), el("relMes"), el("relAno")].forEach(function (s) { s.addEventListener("change", renderRelatorio); });
el("imprimirRelatorio").addEventListener("click", function () { renderRelatorio(); window.print(); });

// ==========================================================================
// AJUSTES (admin/super_admin)
// ==========================================================================
function limparFormularioAjuste() {
  el("ajusteForm").reset();
  el("ajusteId").value = "";
  editandoAjusteId = null;
  el("ajusteFormTitle").textContent = "Novo ajuste";
  el("ajusteCancelEdit").hidden = true;
  el("ajusteFormError").hidden = true;
  el("ajData").value = new Date().toISOString().slice(0, 10);
  el("ajTipo").value = "credito";
}
el("ajusteCancelEdit").addEventListener("click", limparFormularioAjuste);
el("ajusteForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var minutos = parseHorasInput(el("ajHoras").value);
  var erro = null;
  if (!el("ajFuncionario").value) erro = "Selecione o colaborador.";
  else if (!el("ajData").value) erro = "Informe a data do ajuste.";
  else if (minutos === null || minutos <= 0) erro = "Informe a quantidade no formato HH:MM (ex: 08:00).";
  else if (!el("ajMotivo").value.trim()) erro = "Descreva o motivo do ajuste.";
  if (erro) { el("ajusteFormError").hidden = false; el("ajusteFormError").textContent = erro; return; }
  el("ajusteFormError").hidden = true;
  var ajuste = { id: editandoAjusteId || undefined, colaboradorId: el("ajFuncionario").value, data: el("ajData").value, tipo: el("ajTipo").value, minutos: minutos, motivo: el("ajMotivo").value.trim() };
  setSync("syncing");
  var foiEdicao = !!editandoAjusteId;
  salvarAjuste(ajuste).then(function () {
    setSync("ok"); showToast(foiEdicao ? "Ajuste atualizado." : "Ajuste lançado."); limparFormularioAjuste(); return carregarTudo(false);
  }).catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível salvar: " + (err && err.message || "")); });
});
function editarAjuste(id) {
  var a = ajustes.filter(function (x) { return x.id === id; })[0];
  if (!a) return;
  editandoAjusteId = id;
  el("ajusteId").value = id;
  el("ajFuncionario").value = a.colaboradorId;
  el("ajData").value = a.data;
  el("ajTipo").value = a.tipo;
  el("ajHoras").value = minutesToHHMM(a.minutos);
  el("ajMotivo").value = a.motivo;
  el("ajusteFormTitle").textContent = "Editando ajuste";
  el("ajusteCancelEdit").hidden = false;
  window.scrollTo({ top: el("ajusteForm").offsetTop - 20, behavior: "smooth" });
}
function excluirAjusteUI(id) {
  abrirConfirmacao("Excluir ajuste?", "Essa ação não pode ser desfeita.", function () {
    setSync("syncing");
    excluirAjuste(id).then(function () { setSync("ok"); showToast("Ajuste excluído."); return carregarTudo(false); })
      .catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível excluir."); });
  });
}
function renderAjustes() {
  var lista = ajustes.slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  var body = el("ajustesBody");
  body.innerHTML = "";
  el("ajustesVazio").hidden = lista.length !== 0;
  lista.forEach(function (a) {
    var c = getColaborador(a.colaboradorId);
    var tr = document.createElement("tr");
    var tipoClasse = a.tipo === "credito" ? "pos" : "neg";
    var tipoLabel = a.tipo === "credito" ? "Crédito" : "Débito";
    var sinal = a.tipo === "credito" ? "+" : "-";
    tr.innerHTML =
      '<td>' + formatDateBR(a.data) + '</td>' +
      '<td>' + (c ? c.nome : "(colaborador removido)") + '</td>' +
      '<td><span class="badge-saldo ' + tipoClasse + '">' + tipoLabel + '</span></td>' +
      '<td>' + sinal + minutesToHHMM(a.minutos) + '</td>' +
      '<td style="white-space:normal;max-width:260px;">' + a.motivo + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (a.atualizadoPorNome || a.criadoPorNome || '—') + '</small></td>' +
      '<td><div class="row-actions">' +
        '<button class="btn-icon" data-action="editar" data-id="' + a.id + '" title="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
        '<button class="btn-icon danger" data-action="excluir" data-id="' + a.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div></td>';
    body.appendChild(tr);
  });
}
el("ajustesBody").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action]");
  if (!btn) return;
  var id = btn.dataset.id;
  if (btn.dataset.action === "editar") editarAjuste(id);
  if (btn.dataset.action === "excluir") excluirAjusteUI(id);
});

// ==========================================================================
// COLABORADORES (admin/super_admin)
// ==========================================================================
function limparFormularioEmp() {
  el("empForm").reset();
  el("empId").value = "";
  editandoEmpId = null;
  el("empFormTitle").textContent = "Novo colaborador";
  el("empCancelEdit").hidden = true;
  el("empFormError").hidden = true;
  el("empDias").querySelectorAll(".weekday-chip").forEach(function (chip) { chip.classList.remove("checked"); chip.querySelector("input").checked = false; });
  [1, 2, 3, 4, 5].forEach(function (v) {
    var input = el("empDias").querySelector('input[value="' + v + '"]');
    input.checked = true;
    input.closest(".weekday-chip").classList.add("checked");
  });
  el("ajusteSalarialWrap").style.display = "none"; // só faz sentido registrar ajuste pra colaborador já existente
  ajustesSalariais = [];
}

// ------------------------- Ajuste salarial (histórico) -------------------------
function carregarAjustesSalariais(colaboradorId) {
  el("ajustesSalariaisBody").innerHTML = '<tr><td colspan="5" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';
  listarAjustesSalariais(colaboradorId).then(function (lista) {
    ajustesSalariais = lista;
    renderAjustesSalariais();
  }).catch(function (err) {
    console.error(err);
    el("ajustesSalariaisBody").innerHTML = '<tr><td colspan="5" class="empty-state">Não foi possível carregar: ' + (err && err.message || '') + '</td></tr>';
  });
}
function renderAjustesSalariais() {
  var body = el("ajustesSalariaisBody");
  body.innerHTML = "";
  el("ajustesSalariaisVazio").hidden = ajustesSalariais.length !== 0;
  ajustesSalariais.forEach(function (a) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>' + formatDateBR(a.dataAjuste) + '</td>' +
      '<td>' + formataMoeda(a.valorAnterior || 0) + '</td>' +
      '<td>' + formataMoeda(a.valorNovo || 0) + '</td>' +
      '<td>' + (a.motivo || '—') + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (a.criadoPorNome || '—') + '</small></td>';
    body.appendChild(tr);
  });
}
el("ajusteSalarialForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (!editandoEmpId) return;
  var colaborador = getColaborador(editandoEmpId);
  if (!colaborador) return;
  var dataAjuste = el("ajusteSalarialData").value;
  var valorNovo = moedaParaNumero(el("ajusteSalarialValor").value);
  var motivo = el("ajusteSalarialMotivo").value.trim();
  if (!dataAjuste) { el("ajusteSalarialFormError").hidden = false; el("ajusteSalarialFormError").textContent = "Informe a data do ajuste."; return; }
  if (!valorNovo || valorNovo <= 0) { el("ajusteSalarialFormError").hidden = false; el("ajusteSalarialFormError").textContent = "Informe o novo salário."; return; }
  el("ajusteSalarialFormError").hidden = true;

  var registro = {
    colaboradorId: editandoEmpId,
    colaboradorNome: colaborador.nome,
    dataAjuste: dataAjuste,
    valorAnterior: colaborador.salarioBase || 0,
    valorNovo: valorNovo,
    motivo: motivo,
  };
  setSync("syncing");
  salvarAjusteSalarial(registro)
    .then(function () { return salvarColaborador({ id: editandoEmpId, salarioBase: valorNovo }); })
    .then(function () {
      setSync("ok"); showToast("Ajuste salarial registrado.");
      el("ajusteSalarialForm").reset();
      el("empSalario").value = numeroParaMoeda(valorNovo);
      return carregarTudo(false);
    })
    .then(function () { carregarAjustesSalariais(editandoEmpId); })
    .catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível registrar: " + (err && err.message || "")); });
});
el("empDias").querySelectorAll(".weekday-chip").forEach(function (chip) {
  chip.addEventListener("click", function (e) {
    var input = chip.querySelector("input");
    if (e.target.tagName.toLowerCase() !== "input") input.checked = !input.checked;
    chip.classList.toggle("checked", input.checked);
  });
});
el("empCancelEdit").addEventListener("click", limparFormularioEmp);
function diasSelecionados() {
  var vals = [];
  el("empDias").querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) { vals.push(Number(cb.value)); });
  return vals;
}
el("empForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var dias = diasSelecionados();
  var erro = validarHorarios(el("empEntrada").value, el("empSaidaAlmoco").value, el("empRetornoAlmoco").value, el("empSaida").value);
  if (!el("empNome").value.trim()) erro = "Informe o nome do colaborador.";
  if (!erro && !el("empDataAdmissao").value) erro = "Informe a data de admissão.";
  if (!erro && dias.length === 0) erro = "Selecione ao menos um dia de trabalho.";
  if (erro) { el("empFormError").hidden = false; el("empFormError").textContent = erro; return; }
  el("empFormError").hidden = true;
  var colaborador = {
    id: editandoEmpId || undefined,
    nome: el("empNome").value.trim(),
    cpf: el("empCpf").value.trim(),
    email: el("empEmail").value.trim(),
    telefone: el("empTelefone").value.trim(),
    cargo: el("empCargo").value.trim(),
    dataAdmissao: el("empDataAdmissao").value,
    salarioBase: moedaParaNumero(el("empSalario").value),
    entrada: el("empEntrada").value,
    saidaAlmoco: el("empSaidaAlmoco").value,
    retornoAlmoco: el("empRetornoAlmoco").value,
    saida: el("empSaida").value,
    dias: dias,
  };
  setSync("syncing");
  var foiEdicao = !!editandoEmpId;
  salvarColaborador(colaborador).then(function () {
    setSync("ok"); showToast(foiEdicao ? "Colaborador atualizado." : "Colaborador cadastrado."); limparFormularioEmp(); return carregarTudo(false);
  }).catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível salvar: " + (err && err.message || "")); });
});
function editarFuncionario(id) {
  var c = getColaborador(id);
  if (!c) return;
  editandoEmpId = id;
  el("empId").value = id;
  el("empNome").value = c.nome || "";
  el("empCpf").value = c.cpf || "";
  el("empEmail").value = c.email || "";
  el("empTelefone").value = c.telefone || "";
  el("empCargo").value = c.cargo || "";
  el("empDataAdmissao").value = c.dataAdmissao || "";
  el("empSalario").value = c.salarioBase ? numeroParaMoeda(c.salarioBase) : "";
  el("empEntrada").value = c.entrada;
  el("empSaidaAlmoco").value = c.saidaAlmoco;
  el("empRetornoAlmoco").value = c.retornoAlmoco;
  el("empSaida").value = c.saida;
  el("empDias").querySelectorAll(".weekday-chip").forEach(function (chip) {
    var input = chip.querySelector("input");
    var checked = c.dias && c.dias.indexOf(Number(input.value)) !== -1;
    input.checked = checked;
    chip.classList.toggle("checked", checked);
  });
  el("empFormTitle").textContent = "Editando — " + c.nome;
  el("empCancelEdit").hidden = false;
  el("empFormError").hidden = true;
  el("ajusteSalarialWrap").style.display = "block";
  el("ajusteSalarialNome").textContent = c.nome;
  el("ajusteSalarialForm").reset();
  el("ajusteSalarialData").value = new Date().toISOString().slice(0, 10);
  el("ajusteSalarialFormError").hidden = true;
  carregarAjustesSalariais(id);
  window.scrollTo({ top: el("empForm").offsetTop - 20, behavior: "smooth" });
}
function excluirFuncionarioUI(id) {
  var c = getColaborador(id);
  if (!c) return;
  var temRegistros = registros.some(function (r) { return r.colaboradorId === id; });
  var texto = temRegistros
    ? "Este colaborador tem registros de ponto no histórico. Eles serão mantidos, mas deixarão de contar no painel e no relatório. Deseja continuar?"
    : "Essa ação não pode ser desfeita.";
  abrirConfirmacao("Excluir " + c.nome + "?", texto, function () {
    setSync("syncing");
    excluirColaborador(id).then(function () { setSync("ok"); showToast("Colaborador excluído."); return carregarTudo(false); })
      .catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível excluir: " + (err && err.message || "")); });
  });
}
function renderAdminList() {
  var wrap = el("empAdminList");
  if (colaboradores.length === 0) { wrap.innerHTML = '<p class="empty-dashboard">Nenhum colaborador cadastrado ainda.</p>'; return; }
  wrap.innerHTML = "";
  colaboradores.forEach(function (c) {
    var row = document.createElement("div");
    row.className = "emp-admin-row";
    row.innerHTML =
      '<div class="emp-admin-info"><strong>' + c.nome + '</strong><span>' + (c.cargo ? c.cargo + ' · ' : '') + 'admitido em ' + (c.dataAdmissao ? formatDateBR(c.dataAdmissao) : '—') + ' · ' + c.entrada + '–' + c.saida + ' · jornada ' + minutesToHHMM(jornadaMinutos(c)) + ' · ' + diasResumo(c.dias) + (c.salarioBase ? ' · R$ ' + Number(c.salarioBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : '') + '<br><small style="color:var(--ink-faint);">última edição por ' + (c.atualizadoPorNome || c.criadoPorNome || '—') + '</small></span></div>' +
      '<div class="emp-admin-actions">' +
        '<button class="btn-icon" data-action="editar" data-id="' + c.id + '" title="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
        '<button class="btn-icon danger" data-action="excluir" data-id="' + c.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>';
    wrap.appendChild(row);
  });
}
el("empAdminList").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action]");
  if (!btn) return;
  var id = btn.dataset.id;
  if (btn.dataset.action === "editar") editarFuncionario(id);
  if (btn.dataset.action === "excluir") excluirFuncionarioUI(id);
});

// ==========================================================================
// FÉRIAS
// ==========================================================================
el("feriasFuncionario").addEventListener("change", renderFerias);

function colaboradoresParaFerias() {
  var filtroId = el("feriasFuncionario").value;
  if (!ehAdminOuSuperAdmin()) return colaboradores; // já vem só o próprio
  if (filtroId) return colaboradores.filter(function (c) { return c.id === filtroId; });
  return colaboradores;
}

function renderFerias() {
  var wrap = el("feriasResumo");
  var lista = colaboradoresParaFerias();
  if (lista.length === 0) { wrap.innerHTML = '<p class="empty-dashboard">Nenhum colaborador para exibir.</p>'; renderGozos(); return; }
  var hoje = new Date().toISOString().slice(0, 10);
  var html = "";
  lista.forEach(function (c) {
    if (!c.dataAdmissao) return;
    var gozosDoColab = feriasGozos.filter(function (g) { return g.colaboradorId === c.id; });
    var periodos = periodosAquisitivos(c, hoje, gozosDoColab);
    html += '<div class="card" style="margin-bottom:16px;">' +
      '<h3 style="font-size:1.05rem;margin-bottom:12px;">' + c.nome + ' <small style="color:var(--ink-faint);font-weight:400;font-size:.78rem;">admitido em ' + formatDateBR(c.dataAdmissao) + '</small></h3>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Período aquisitivo</th><th>Situação</th><th>Dias com direito</th><th>Gozados</th><th>Saldo</th><th>Vence em</th></tr></thead><tbody>';
    periodos.forEach(function (p) {
      html += '<tr><td>' + formatDateBR(p.inicio) + ' – ' + formatDateBR(p.fim) + '</td>' +
        '<td><span class="status-pill ' + p.status + '">' + STATUS_LABEL[p.status] + '</span></td>' +
        '<td>' + p.diasDireito + '</td><td>' + p.diasGozados + '</td><td>' + p.saldo + '</td>' +
        '<td>' + (p.concessivoFim ? formatDateBR(p.concessivoFim) + (p.diasParaVencer !== null ? ' (' + p.diasParaVencer + ' dias)' : '') : '—') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  });
  wrap.innerHTML = html || '<p class="empty-dashboard">Nenhum colaborador com data de admissão cadastrada.</p>';
  renderGozos();
}

el("gozoFuncionario").addEventListener("change", function () {
  var colabId = el("gozoFuncionario").value;
  var select = el("gozoPeriodo");
  select.innerHTML = "";
  var c = getColaborador(colabId);
  if (!c || !c.dataAdmissao) { select.innerHTML = '<option value="" disabled selected>Colaborador sem data de admissão</option>'; return; }
  var gozosDoColab = feriasGozos.filter(function (g) { return g.colaboradorId === colabId; });
  var periodos = periodosAquisitivos(c, new Date().toISOString().slice(0, 10), gozosDoColab).filter(function (p) { return p.completo && p.saldo > 0; });
  if (periodos.length === 0) { select.innerHTML = '<option value="" disabled selected>Nenhum período completo com saldo disponível</option>'; return; }
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  periodos.forEach(function (p) {
    var opt = document.createElement("option");
    opt.value = p.inicio;
    opt.textContent = formatDateBR(p.inicio) + ' – ' + formatDateBR(p.fim) + ' (saldo: ' + p.saldo + ' dias)';
    select.appendChild(opt);
  });
});
el("gozoForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var colabId = el("gozoFuncionario").value;
  var periodoInicio = el("gozoPeriodo").value;
  var dataInicio = el("gozoInicio").value;
  var dataFim = el("gozoFim").value;
  var erro = null;
  if (!colabId) erro = "Selecione o colaborador.";
  else if (!periodoInicio) erro = "Selecione o período aquisitivo.";
  else if (!dataInicio || !dataFim) erro = "Informe o início e o fim do gozo.";
  else if (dataFim < dataInicio) erro = "A data final não pode ser antes da inicial.";
  if (erro) { el("gozoFormError").hidden = false; el("gozoFormError").textContent = erro; return; }
  el("gozoFormError").hidden = true;
  var dias = diffDias(dataInicio, dataFim) + 1;
  setSync("syncing");
  salvarFeriasGozo({ colaboradorId: colabId, periodoAquisitivoInicio: periodoInicio, dataInicio: dataInicio, dataFim: dataFim, dias: dias }).then(function () {
    setSync("ok"); showToast("Férias lançadas."); el("gozoForm").reset(); return carregarTudo(false);
  }).catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível salvar: " + (err && err.message || "")); });
});
function renderGozos() {
  var body = el("gozosBody");
  body.innerHTML = "";
  el("gozosVazio").hidden = feriasGozos.length !== 0;
  feriasGozos.slice().sort(function (a, b) { return a.dataInicio < b.dataInicio ? 1 : -1; }).forEach(function (g) {
    var c = getColaborador(g.colaboradorId);
    var tr = document.createElement("tr");
    var acoes = ehAdminOuSuperAdmin() ? '<button class="btn-icon danger" data-action="excluir" data-id="' + g.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '';
    tr.innerHTML = '<td>' + (c ? c.nome : '(colaborador removido)') + '</td><td>' + formatDateBR(g.periodoAquisitivoInicio) + '</td><td>' + formatDateBR(g.dataInicio) + ' – ' + formatDateBR(g.dataFim) + '</td><td>' + g.dias + '</td><td><small style="color:var(--ink-faint);">' + (g.atualizadoPorNome || g.criadoPorNome || '—') + '</small></td><td>' + acoes + '</td>';
    body.appendChild(tr);
  });
}
el("gozosBody").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action='excluir']");
  if (!btn) return;
  var id = btn.dataset.id;
  abrirConfirmacao("Excluir férias lançadas?", "Essa ação não pode ser desfeita.", function () {
    setSync("syncing");
    excluirFeriasGozo(id).then(function () { setSync("ok"); showToast("Excluído."); return carregarTudo(false); })
      .catch(function (err) { console.error(err); setSync("error"); showToast("Não foi possível excluir."); });
  });
});

// ------------------------- Alternador CLT / PJ (Férias) -------------------------
el("feriasRegimeToggle").querySelectorAll(".regime-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var regime = btn.dataset.regime;
    el("feriasRegimeToggle").querySelectorAll(".regime-btn").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
    el("feriasCltWrap").style.display = regime === "clt" ? "block" : "none";
    el("feriasPjWrap").style.display = regime === "pj" ? "block" : "none";
    if (regime === "pj" && ehSuperAdmin()) carregarPJ();
  });
});

// ==========================================================================
// RESCISÃO (admin/super_admin)
// ==========================================================================
function montarSelectAvisoPrevio() {
  var tipo = el("rescTipo").value;
  var select = el("rescAviso");
  select.innerHTML = "";
  (AVISOS_POR_TIPO[tipo] || []).forEach(function (par) {
    var opt = document.createElement("option");
    opt.value = par[0]; opt.textContent = par[1];
    select.appendChild(opt);
  });
}
el("rescTipo").addEventListener("change", montarSelectAvisoPrevio);

el("rescisaoForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var colabId = el("rescFuncionario").value;
  var colaborador = getColaborador(colabId);
  var dataDemissao = el("rescData").value;
  var tipo = el("rescTipo").value;
  var avisoTipo = el("rescAviso").value;
  if (!colaborador) { el("rescisaoFormError").hidden = false; el("rescisaoFormError").textContent = "Selecione o colaborador."; return; }
  if (!dataDemissao) { el("rescisaoFormError").hidden = false; el("rescisaoFormError").textContent = "Informe a data de desligamento."; return; }
  el("rescisaoFormError").hidden = true;

  var registrosColab = registros.filter(function (r) { return r.colaboradorId === colabId; });
  var ajustesColab = ajustes.filter(function (a) { return a.colaboradorId === colabId; });
  var gozosColab = feriasGozos.filter(function (g) { return g.colaboradorId === colabId; });
  var saldoBH = saldoBancoHorasMinutos(colaborador, registrosColab, ajustesColab);

  var resultado = calcularRescisao(colaborador, dataDemissao, tipo, avisoTipo, saldoBH, gozosColab);
  renderResultadoRescisao(resultado, colaborador);

  setSync("syncing");
  salvarRescisao({ colaboradorId: colabId, dataDemissao: dataDemissao, tipoRescisao: tipo, avisoPrevioTipo: avisoTipo, resultado: resultado })
    .then(function () { return salvarColaborador({ id: colabId, dataDemissao: dataDemissao }); })
    .then(function () { setSync("ok"); showToast("Rescisão calculada e registrada. Colaborador marcado como desligado em " + formatDateBR(dataDemissao) + "."); return carregarTudo(false); })
    .catch(function (err) { console.error(err); setSync("error"); showToast("Cálculo exibido, mas não foi possível salvar: " + (err && err.message || "")); });
});

function renderResultadoRescisao(r, colaborador) {
  var obsHtml = r.observacoes.map(function (o) { return "<li>" + o + "</li>"; }).join("");
  el("rescisaoResultadoWrap").innerHTML =
    '<div class="card rescisao-resultado">' +
      '<h2 style="font-size:1.2rem;margin-bottom:4px;">' + colaborador.nome + '</h2>' +
      '<p style="color:var(--ink-soft);font-size:.85rem;margin:0 0 10px;">' + TIPOS_RESCISAO[r.tipoRescisao] + ' · desligamento em ' + formatarDataBR(r.dataDemissao) + '</p>' +
      '<div class="rescisao-linha"><span>Saldo de salário (' + r.diasTrabalhadosMes + ' dia(s))</span><strong>' + formataMoeda(r.saldoSalario) + '</strong></div>' +
      (r.avisoPrevioValor ? '<div class="rescisao-linha"><span>Aviso prévio (' + r.diasAvisoPrevio + ' dias)</span><strong>' + formataMoeda(r.avisoPrevioValor) + '</strong></div>' : '') +
      (r.descontoAviso ? '<div class="rescisao-linha"><span>Desconto de aviso prévio não cumprido</span><strong style="color:var(--negative)">- ' + formataMoeda(r.descontoAviso) + '</strong></div>' : '') +
      (r.feriasVencidasValor ? '<div class="rescisao-linha"><span>Férias vencidas (' + r.feriasVencidasDias + ' dias) + 1/3</span><strong>' + formataMoeda(r.feriasVencidasValor + r.feriasVencidasTerco) + '</strong></div>' : '') +
      (r.feriasProporcionaisValor ? '<div class="rescisao-linha"><span>Férias proporcionais (' + r.feriasProporcionaisDias.toFixed(1) + ' dias) + 1/3</span><strong>' + formataMoeda(r.feriasProporcionaisValor + r.feriasProporcionaisTerco) + '</strong></div>' : '') +
      (r.decimoTerceiroValor ? '<div class="rescisao-linha"><span>13º salário proporcional (' + r.decimoTerceiroMeses + '/12)</span><strong>' + formataMoeda(r.decimoTerceiroValor) + '</strong></div>' : '') +
      (r.bancoHorasValor ? '<div class="rescisao-linha"><span>Quitação do banco de horas</span><strong style="color:' + (r.bancoHorasValor > 0 ? "var(--positive)" : "var(--negative)") + '">' + formataMoeda(r.bancoHorasValor) + '</strong></div>' : '') +
      '<div class="rescisao-total"><span>Total estimado</span><strong>' + formataMoeda(r.total) + '</strong></div>' +
      '<ul class="rescisao-obs">' + obsHtml + '</ul>' +
      '<div class="disclaimer-box">Valor de apoio. Não inclui FGTS (8% + multa de 40%), INSS/IRRF, nem convenções coletivas específicas. Confira com um(a) contador(a) antes de qualquer pagamento.</div>' +
    '</div>';
}

// ------------------------- Alternador CLT / PJ (Rescisão / Distrato) -------------------------
el("rescisaoRegimeToggle").querySelectorAll(".regime-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var regime = btn.dataset.regime;
    el("rescisaoRegimeToggle").querySelectorAll(".regime-btn").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
    el("rescisaoCltWrap").style.display = regime === "clt" ? "block" : "none";
    el("rescisaoPjWrap").style.display = regime === "pj" ? "block" : "none";
    if (regime === "pj" && ehSuperAdmin()) carregarPJ().then(function () { popularSelectDistratoPj(); carregarDistratosPJ(); });
  });
});

// ==========================================================================
// DISTRATO PJ (Super Admin apenas) — NÃO é rescisão CLT, ver calculo-distrato-pj.js
// ==========================================================================
var distratosPJ = [];

function popularSelectDistratoPj() {
  var select = el("distratoPjPrestador");
  var valorAtual = select.value;
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  prestadoresPJ.forEach(function (pj) {
    var opt = document.createElement("option");
    opt.value = pj.id; opt.textContent = pj.nomeRazaoSocial;
    select.appendChild(opt);
  });
  select.value = valorAtual;
}

function carregarDistratosPJ() {
  el("distratosPjBody").innerHTML = '<tr><td colspan="6" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';
  listarDistratosPJ().then(function (lista) {
    distratosPJ = lista;
    renderDistratosPJ();
  }).catch(function (err) {
    console.error(err);
    el("distratosPjBody").innerHTML = '<tr><td colspan="6" class="empty-state">Não foi possível carregar: ' + (err && err.message || '') + '</td></tr>';
  });
}

function renderDistratosPJ() {
  var body = el("distratosPjBody");
  body.innerHTML = "";
  el("distratosPjVazio").hidden = distratosPJ.length !== 0;
  distratosPJ.forEach(function (d) {
    var pj = getPrestadorPJ(d.prestadorId);
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>' + (pj ? pj.nomeRazaoSocial : (d.prestadorNome || '(prestador removido)')) + '</td>' +
      '<td>' + formatDateBR(d.dataEncerramento) + '</td>' +
      '<td>' + (MOTIVOS_DISTRATO_PJ[d.motivo] || d.motivo) + '</td>' +
      '<td>' + (Number(d.avisoDias) > 0 ? d.avisoDias + ' dias' : '—') + '</td>' +
      '<td>' + formataMoeda(d.honorarioProporcional) + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (d.criadoPorNome || '—') + '</small></td>';
    body.appendChild(tr);
  });
}

function renderResultadoDistratoPj(calc, pj, d) {
  el("distratoPjResultadoWrap").innerHTML =
    '<div class="card rescisao-resultado">' +
      '<h2 style="font-size:1.2rem;margin-bottom:4px;">' + pj.nomeRazaoSocial + '</h2>' +
      '<p style="color:var(--ink-soft);font-size:.85rem;margin:0 0 10px;">' + (MOTIVOS_DISTRATO_PJ[d.motivo] || d.motivo) + ' · encerramento em ' + formatDateBR(d.dataEncerramento) + '</p>' +
      '<div class="rescisao-linha"><span>Honorário proporcional (' + calc.diaEncerramento + ' de ' + calc.diasNoMes + ' dias do mês)</span><strong>' + formataMoeda(calc.proporcional) + '</strong></div>' +
      (Number(d.avisoDias) > 0 ? '<div class="rescisao-linha"><span>Aviso combinado em contrato</span><strong>' + d.avisoDias + ' dias</strong></div>' : '') +
      (d.observacao ? '<div class="rescisao-linha"><span>Observações</span><strong style="font-weight:600;">' + d.observacao + '</strong></div>' : '') +
      '<div class="disclaimer-box">Este valor é só o proporcional de honorários do mês do encerramento — um cálculo civil simples de dias corridos, não uma verba trabalhista. Não inclui 13º, férias + 1/3, aviso prévio proporcional CLT nem multa de FGTS: PJ não tem esses direitos automaticamente. Qualquer multa ou valor adicional depende só do que está escrito no contrato.</div>' +
    '</div>';
}

el("distratoPjForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var prestadorId = el("distratoPjPrestador").value;
  var pj = getPrestadorPJ(prestadorId);
  var dataEncerramento = el("distratoPjData").value;
  var motivo = el("distratoPjMotivo").value;
  var avisoDias = Number(el("distratoPjAviso").value) || 0;
  var observacao = el("distratoPjObs").value.trim();

  if (!pj) { el("distratoPjFormError").hidden = false; el("distratoPjFormError").textContent = "Selecione o prestador."; return; }
  if (!dataEncerramento) { el("distratoPjFormError").hidden = false; el("distratoPjFormError").textContent = "Informe a data de encerramento."; return; }
  el("distratoPjFormError").hidden = true;

  var calc = calcularHonorarioProporcionalPJ(dataEncerramento, pj.valorHonorarioMensal);
  var registro = {
    prestadorId: prestadorId,
    prestadorNome: pj.nomeRazaoSocial,
    dataEncerramento: dataEncerramento,
    motivo: motivo,
    avisoDias: avisoDias,
    observacao: observacao,
    honorarioProporcional: calc.proporcional,
  };
  renderResultadoDistratoPj(calc, pj, registro);

  salvarDistratoPJ(registro)
    .then(function () { showToast("Distrato registrado."); el("distratoPjForm").reset(); el("distratoPjAviso").value = "0"; return carregarDistratosPJ(); })
    .catch(function (err) { console.error(err); showToast("Cálculo exibido, mas não foi possível salvar: " + (err && err.message || "")); });
});

// ==========================================================================
// PRESTADORES PJ (Super Admin apenas)
// ==========================================================================
function carregarPJ() {
  el("pjBody").innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';
  return Promise.all([listarPrestadoresPJ(), listarPjPeriodos()]).then(function (results) {
    prestadoresPJ = results[0];
    pjPeriodos = results[1];
    renderPJ();
    popularSelectPjPeriodo();
    renderPjPeriodos();
  }).catch(function (err) { console.error(err); el("pjBody").innerHTML = '<tr><td colspan="9" class="empty-state">Não foi possível carregar: ' + (err && err.message || '') + '</td></tr>'; });
}
function popularSelectPjPeriodo() {
  var select = el("pjPeriodoPrestador");
  var valorAtual = select.value;
  select.innerHTML = '<option value="" disabled selected>Selecione</option>';
  prestadoresPJ.forEach(function (pj) {
    var opt = document.createElement("option");
    opt.value = pj.id; opt.textContent = pj.nomeRazaoSocial;
    select.appendChild(opt);
  });
  select.value = valorAtual;
}
function getPrestadorPJ(id) {
  for (var i = 0; i < prestadoresPJ.length; i++) if (prestadoresPJ[i].id === id) return prestadoresPJ[i];
  return null;
}
el("pjPeriodoForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var prestadorId = el("pjPeriodoPrestador").value;
  var inicio = el("pjPeriodoInicio").value;
  var fim = el("pjPeriodoFim").value;
  var erro = null;
  if (!prestadorId) erro = "Selecione o prestador.";
  else if (!inicio || !fim) erro = "Informe o início e o fim do período.";
  else if (fim < inicio) erro = "A data final não pode ser antes da inicial.";
  if (erro) { el("pjPeriodoFormError").hidden = false; el("pjPeriodoFormError").textContent = erro; return; }
  el("pjPeriodoFormError").hidden = true;
  var dias = diffDias(inicio, fim) + 1;
  salvarPjPeriodo({ prestadorId: prestadorId, dataInicio: inicio, dataFim: fim, dias: dias, observacao: el("pjPeriodoObs").value.trim() })
    .then(function () { showToast("Período lançado."); el("pjPeriodoForm").reset(); return carregarPJ(); })
    .catch(function (err) { console.error(err); showToast("Não foi possível salvar: " + (err && err.message || "")); });
});
function renderPjPeriodos() {
  var body = el("pjPeriodosBody");
  body.innerHTML = "";
  el("pjPeriodosVazio").hidden = pjPeriodos.length !== 0;

  // Espelho somente-leitura na aba Férias (alternador PJ) — mesmos dados,
  // sem botão de excluir (gestão fica só na aba Prestadores PJ).
  var bodyEspelho = el("feriasPjPeriodosBody");
  if (bodyEspelho) bodyEspelho.innerHTML = "";
  if (el("feriasPjPeriodosVazio")) el("feriasPjPeriodosVazio").hidden = pjPeriodos.length !== 0;

  pjPeriodos.forEach(function (p) {
    var pj = getPrestadorPJ(p.prestadorId);
    var celulas =
      '<td>' + (pj ? pj.nomeRazaoSocial : '(prestador removido)') + '</td>' +
      '<td>' + formatDateBR(p.dataInicio) + ' – ' + formatDateBR(p.dataFim) + '</td>' +
      '<td>' + p.dias + '</td>' +
      '<td style="white-space:normal;max-width:260px;">' + (p.observacao || '—') + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (p.atualizadoPorNome || p.criadoPorNome || '—') + '</small></td>';

    var tr = document.createElement("tr");
    tr.innerHTML = celulas + '<td><button class="btn-icon danger" data-action="excluir" data-id="' + p.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>';
    body.appendChild(tr);

    if (bodyEspelho) {
      var trEspelho = document.createElement("tr");
      trEspelho.innerHTML = celulas;
      bodyEspelho.appendChild(trEspelho);
    }
  });
}
el("pjPeriodosBody").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action='excluir']");
  if (!btn) return;
  var id = btn.dataset.id;
  abrirConfirmacao("Excluir período?", "Essa ação não pode ser desfeita.", function () {
    excluirPjPeriodo(id).then(function () { showToast("Período excluído."); return carregarPJ(); })
      .catch(function (err) { console.error(err); showToast("Não foi possível excluir."); });
  });
});
function limparFormularioPj() {
  el("pjForm").reset();
  el("pjId").value = "";
  editandoPjId = null;
  el("pjFormTitle").textContent = "Novo prestador PJ";
  el("pjCancelEdit").hidden = true;
  el("pjFormError").hidden = true;
  el("pjStatus").value = "Ativo";
  el("ajusteHonorarioWrap").style.display = "none"; // só faz sentido pra prestador já existente
  ajustesHonorarioPJ = [];
}

// ------------------------- Ajuste de honorário PJ (histórico) -------------------------
function carregarAjustesHonorarioPJ(prestadorId) {
  el("ajustesHonorarioBody").innerHTML = '<tr><td colspan="5" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';
  listarAjustesHonorarioPJ(prestadorId).then(function (lista) {
    ajustesHonorarioPJ = lista;
    renderAjustesHonorarioPJ();
  }).catch(function (err) {
    console.error(err);
    el("ajustesHonorarioBody").innerHTML = '<tr><td colspan="5" class="empty-state">Não foi possível carregar: ' + (err && err.message || '') + '</td></tr>';
  });
}
function renderAjustesHonorarioPJ() {
  var body = el("ajustesHonorarioBody");
  body.innerHTML = "";
  el("ajustesHonorarioVazio").hidden = ajustesHonorarioPJ.length !== 0;
  ajustesHonorarioPJ.forEach(function (a) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>' + formatDateBR(a.dataAjuste) + '</td>' +
      '<td>' + formataMoeda(a.valorAnterior || 0) + '</td>' +
      '<td>' + formataMoeda(a.valorNovo || 0) + '</td>' +
      '<td>' + (a.motivo || '—') + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (a.criadoPorNome || '—') + '</small></td>';
    body.appendChild(tr);
  });
}
el("ajusteHonorarioForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (!editandoPjId) return;
  var pj = prestadoresPJ.filter(function (p) { return p.id === editandoPjId; })[0];
  if (!pj) return;
  var dataAjuste = el("ajusteHonorarioData").value;
  var valorNovo = moedaParaNumero(el("ajusteHonorarioValor").value);
  var motivo = el("ajusteHonorarioMotivo").value.trim();
  if (!dataAjuste) { el("ajusteHonorarioFormError").hidden = false; el("ajusteHonorarioFormError").textContent = "Informe a data do ajuste."; return; }
  if (!valorNovo || valorNovo <= 0) { el("ajusteHonorarioFormError").hidden = false; el("ajusteHonorarioFormError").textContent = "Informe o novo honorário."; return; }
  el("ajusteHonorarioFormError").hidden = true;

  var registro = {
    prestadorId: editandoPjId,
    prestadorNome: pj.nomeRazaoSocial,
    dataAjuste: dataAjuste,
    valorAnterior: pj.valorHonorarioMensal || 0,
    valorNovo: valorNovo,
    motivo: motivo,
  };
  salvarAjusteHonorarioPJ(registro)
    .then(function () { return salvarPrestadorPJ({ id: editandoPjId, valorHonorarioMensal: valorNovo }); })
    .then(function () {
      showToast("Ajuste de honorário registrado.");
      el("ajusteHonorarioForm").reset();
      el("pjValor").value = numeroParaMoeda(valorNovo);
      return carregarPJ();
    })
    .then(function () { carregarAjustesHonorarioPJ(editandoPjId); })
    .catch(function (err) { console.error(err); showToast("Não foi possível registrar: " + (err && err.message || "")); });
});
el("pjCancelEdit").addEventListener("click", limparFormularioPj);
el("pjForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var pj = {
    id: editandoPjId || undefined,
    nomeRazaoSocial: el("pjNome").value.trim(),
    cnpj: el("pjCnpj").value.trim(),
    cargoFuncao: el("pjCargo").value.trim(),
    dataAdmissao: el("pjDataAdmissao").value,
    valorHonorarioMensal: moedaParaNumero(el("pjValor").value),
    statusContrato: el("pjStatus").value,
    dataTerminoRenovacao: el("pjDataTermino").value || null,
  };
  if (!pj.nomeRazaoSocial || !pj.cargoFuncao || !pj.dataAdmissao) { el("pjFormError").hidden = false; el("pjFormError").textContent = "Preencha nome, cargo e data de início."; return; }
  el("pjFormError").hidden = true;
  var foiEdicao = !!editandoPjId;
  salvarPrestadorPJ(pj).then(function () { showToast(foiEdicao ? "Prestador atualizado." : "Prestador cadastrado."); limparFormularioPj(); carregarPJ(); })
    .catch(function (err) { console.error(err); showToast("Não foi possível salvar: " + (err && err.message || "")); });
});
function editarPj(id) {
  var pj = prestadoresPJ.filter(function (p) { return p.id === id; })[0];
  if (!pj) return;
  editandoPjId = id;
  el("pjId").value = id;
  el("pjNome").value = pj.nomeRazaoSocial || "";
  el("pjCnpj").value = pj.cnpj || "";
  el("pjCargo").value = pj.cargoFuncao || "";
  el("pjDataAdmissao").value = pj.dataAdmissao || "";
  el("pjValor").value = pj.valorHonorarioMensal ? numeroParaMoeda(pj.valorHonorarioMensal) : "";
  el("pjStatus").value = pj.statusContrato || "Ativo";
  el("pjDataTermino").value = pj.dataTerminoRenovacao || "";
  el("pjFormTitle").textContent = "Editando — " + pj.nomeRazaoSocial;
  el("pjCancelEdit").hidden = false;
  el("ajusteHonorarioWrap").style.display = "block";
  el("ajusteHonorarioNome").textContent = pj.nomeRazaoSocial;
  el("ajusteHonorarioForm").reset();
  el("ajusteHonorarioData").value = new Date().toISOString().slice(0, 10);
  el("ajusteHonorarioFormError").hidden = true;
  carregarAjustesHonorarioPJ(id);
  window.scrollTo({ top: el("pjForm").offsetTop - 20, behavior: "smooth" });
}
function excluirPjUI(id) {
  abrirConfirmacao("Excluir prestador PJ?", "Essa ação não pode ser desfeita.", function () {
    excluirPrestadorPJ(id).then(function () { showToast("Prestador excluído."); carregarPJ(); })
      .catch(function (err) { console.error(err); showToast("Não foi possível excluir."); });
  });
}
function renderPJ() {
  var body = el("pjBody");
  body.innerHTML = "";
  el("pjVazio").hidden = prestadoresPJ.length !== 0;
  prestadoresPJ.forEach(function (pj) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><strong>' + pj.nomeRazaoSocial + '</strong> <span class="badge-pj">PJ</span></td>' +
      '<td>' + (pj.cnpj || '—') + '</td>' +
      '<td>' + pj.cargoFuncao + '</td>' +
      '<td>' + (pj.dataAdmissao ? formatDateBR(pj.dataAdmissao) : '—') + '</td>' +
      '<td>R$ ' + Number(pj.valorHonorarioMensal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + '</td>' +
      '<td><span class="status-contrato ' + pj.statusContrato + '">' + pj.statusContrato + '</span></td>' +
      '<td>' + (pj.dataTerminoRenovacao ? formatDateBR(pj.dataTerminoRenovacao) : '<small style="color:var(--ink-faint);">Renovação automática</small>') + '</td>' +
      '<td><small style="color:var(--ink-faint);">' + (pj.atualizadoPorNome || pj.criadoPorNome || '—') + '</small></td>' +
      '<td><div class="row-actions">' +
        '<button class="btn-icon" data-action="editar" data-id="' + pj.id + '" title="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>' +
        '<button class="btn-icon danger" data-action="excluir" data-id="' + pj.id + '" title="Excluir"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div></td>';
    body.appendChild(tr);
  });
}
el("pjBody").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action]");
  if (!btn) return;
  var id = btn.dataset.id;
  if (btn.dataset.action === "editar") editarPj(id);
  if (btn.dataset.action === "excluir") excluirPjUI(id);
});

// ==========================================================================
// USUÁRIOS (Super Admin apenas)
// ==========================================================================
el("usrPerfil").addEventListener("change", function () {
  el("usrColaboradorWrap").style.display = el("usrPerfil").value === "funcionario" ? "flex" : "none";
});
el("usrPerfil").dispatchEvent(new Event("change"));

function carregarUsuarios() {
  el("usuariosList").innerHTML = '<div class="loading-veil"><span class="spinner"></span> Carregando...</div>';
  listarUsuarios().then(function (lista) {
    listaUsuarios = lista;
    renderUsuarios();
    el("usuariosLimiteHint").innerHTML = 'Limite de ' + LIMITE_CONTAS + ' contas no total (' + contarUsuariosAtivos(lista) + '/' + LIMITE_CONTAS + ' em uso).';
  }).catch(function (err) { console.error(err); el("usuariosList").innerHTML = '<p class="empty-dashboard">Não foi possível carregar: ' + (err && err.message || '') + '</p>'; });
}
el("usuarioForm").addEventListener("submit", function (e) {
  e.preventDefault();
  el("usuarioFormError").hidden = true;
  el("usuarioFormOk").hidden = true;
  if (contarUsuariosAtivos(listaUsuarios) >= LIMITE_CONTAS) {
    el("usuarioFormError").hidden = false;
    el("usuarioFormError").textContent = "Limite de " + LIMITE_CONTAS + " contas atingido. Inative uma conta existente antes de criar outra.";
    return;
  }
  var dados = {
    nome: el("usrNome").value.trim(),
    email: el("usrEmail").value.trim(),
    perfil: el("usrPerfil").value,
    colaboradorId: el("usrPerfil").value === "funcionario" ? (el("usrColaborador").value || null) : null,
  };
  if (!dados.nome || !dados.email) {
    el("usuarioFormError").hidden = false;
    el("usuarioFormError").textContent = "Preencha nome e e-mail.";
    return;
  }
  var btn = el("usuarioForm").querySelector("button[type=submit]");
  btn.disabled = true;
  criarUsuario(dados).then(function () {
    el("usuarioFormOk").hidden = false;
    el("usuarioFormOk").textContent = "Conta criada. Avise " + dados.nome + " do e-mail e da senha padrão (Parlamento2026) — o sistema já vai pedir pra trocar no primeiro acesso.";
    el("usuarioForm").reset();
    el("usrPerfil").dispatchEvent(new Event("change"));
    carregarUsuarios();
  }).catch(function (err) {
    console.error(err);
    var msg = "Não foi possível criar a conta.";
    if (err && err.code === "auth/email-already-in-use") msg = "Já existe uma conta com este e-mail.";
    if (err && err.code === "auth/weak-password") msg = "Senha muito fraca — use pelo menos 6 caracteres.";
    if (err && err.code === "auth/invalid-email") msg = "E-mail inválido.";
    el("usuarioFormError").hidden = false;
    el("usuarioFormError").textContent = msg;
  }).finally(function () { btn.disabled = false; });
});
function renderUsuarios() {
  var wrap = el("usuariosList");
  if (listaUsuarios.length === 0) { wrap.innerHTML = '<p class="empty-dashboard">Nenhuma conta cadastrada ainda.</p>'; return; }
  wrap.innerHTML = "";
  listaUsuarios.forEach(function (u) {
    var c = u.colaboradorId ? getColaborador(u.colaboradorId) : null;
    var row = document.createElement("div");
    row.className = "emp-admin-row";
    var vc = u.id === usuarioAtual.uid ? " (você)" : "";
    row.innerHTML =
      '<div class="emp-admin-info"><strong>' + u.nome + vc + '</strong><span>' + u.email + ' · <span class="perfil-badge ' + u.perfil + '">' + PERFIL_LABEL[u.perfil] + '</span>' + (c ? ' · vinculado a ' + c.nome : '') + (u.senhaProvisoria ? ' · <strong style="color:var(--warning, #b8860b)">ainda não trocou a senha</strong>' : '') + (u.ativo ? '' : ' · <strong style="color:var(--negative)">inativo</strong>') + '</span></div>' +
      '<div class="emp-admin-actions">' +
        (u.id !== usuarioAtual.uid ? '<button class="btn-ghost btn" data-action="toggle" data-id="' + u.id + '" data-ativo="' + u.ativo + '">' + (u.ativo ? "Inativar" : "Reativar") + '</button>' : '') +
      '</div>';
    wrap.appendChild(row);
  });
}
el("usuariosList").addEventListener("click", function (e) {
  var btn = e.target.closest("button[data-action='toggle']");
  if (!btn) return;
  var id = btn.dataset.id;
  var ativo = btn.dataset.ativo === "true";
  inativarUsuario(id, !ativo).then(function () { showToast(!ativo ? "Conta reativada." : "Conta inativada."); carregarUsuarios(); })
    .catch(function (err) { console.error(err); showToast("Não foi possível alterar: " + (err && err.message || "")); });
});

})();
