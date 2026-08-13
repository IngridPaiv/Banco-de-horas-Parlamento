/*
 * Acesso ao Firestore — uma coleção por tipo de dado (cada registro é um
 * documento). Isso é diferente do site antigo (que guardava tudo como um
 * array dentro de 3 documentos únicos): com um documento por registro, as
 * regras de segurança do Firestore conseguem controlar o acesso registro a
 * registro (ex: um funcionário só consegue LER/CRIAR pontos com o próprio
 * colaboradorId — o Firestore recusa a consulta se ela não vier filtrada
 * assim, então o filtro abaixo em cada função não é só conveniência, é
 * exigido pelas regras).
 */

function colecao(nome) { return db.collection(nome); }

function novoId(colecaoNome) { return colecao(colecaoNome).doc().id; }

// Ordena uma lista já carregada por um campo de data (string "AAAA-MM-DD",
// que ordena certo em texto puro), da mais recente pra mais antiga.
// Usado no lugar de ".orderBy()" do Firestore nas consultas que combinam
// filtro (".where") com ordenação por outro campo — essa combinação exige
// criar um índice composto manualmente no Console do Firebase, o que trava
// a tela com "Missing or insufficient permissions" / "query requires an
// index" até alguém lembrar de criar; ordenando aqui no navegador (as
// listas desse sistema são pequenas) a gente evita depender disso.
function ordenarPorDataDesc(lista, campo) {
  return lista.slice().sort(function (a, b) {
    var va = a[campo] || "";
    var vb = b[campo] || "";
    if (va === vb) return 0;
    return va < vb ? 1 : -1;
  });
}

// Carimba QUEM fez a alteração e QUANDO — em todo salvamento (criação ou
// edição), não só no primeiro. Guarda o nome já pronto (não só o uid) para
// aparecer na tela sem precisar de outra consulta ao banco.
function comCarimbo(dados) {
  return Object.assign({}, dados, {
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: usuarioAtual ? usuarioAtual.uid : null,
    atualizadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
}

// ------------------------- Colaboradores -------------------------
function listarColaboradores() {
  return colecao("colaboradores").orderBy("nome").get().then(snapToList);
}
function obterColaborador(id) {
  return colecao("colaboradores").doc(id).get().then(function (doc) {
    return doc.exists ? Object.assign({ id: doc.id }, doc.data()) : null;
  });
}
function salvarColaborador(colaborador) {
  var id = colaborador.id || novoId("colaboradores");
  var dados = Object.assign({}, colaborador);
  delete dados.id;
  if (!colaborador.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("colaboradores").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirColaborador(id) {
  return colecao("colaboradores").doc(id).delete();
}

// ------------------------- Registros de ponto -------------------------
function listarRegistros(colaboradorId) {
  var ref = colecao("registros");
  if (colaboradorId) ref = ref.where("colaboradorId", "==", colaboradorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "data"); });
}
function salvarRegistro(registro) {
  var id = registro.id || novoId("registros");
  var dados = Object.assign({}, registro);
  delete dados.id;
  if (!registro.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("registros").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirRegistro(id) {
  return colecao("registros").doc(id).delete();
}

// ------------------------- Ajustes de banco de horas -------------------------
function listarAjustes(colaboradorId) {
  var ref = colecao("ajustes");
  if (colaboradorId) ref = ref.where("colaboradorId", "==", colaboradorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "data"); });
}
function salvarAjuste(ajuste) {
  var id = ajuste.id || novoId("ajustes");
  var dados = Object.assign({}, ajuste);
  delete dados.id;
  if (!ajuste.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("ajustes").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirAjuste(id) {
  return colecao("ajustes").doc(id).delete();
}

// ------------------------- Férias (gozos lançados) -------------------------
function listarFeriasGozos(colaboradorId) {
  var ref = colecao("feriasGozos");
  if (colaboradorId) ref = ref.where("colaboradorId", "==", colaboradorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataInicio"); });
}
function salvarFeriasGozo(gozo) {
  var id = gozo.id || novoId("feriasGozos");
  var dados = Object.assign({}, gozo);
  delete dados.id;
  if (!gozo.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("feriasGozos").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirFeriasGozo(id) {
  return colecao("feriasGozos").doc(id).delete();
}

// ------------------------- Rescisões (histórico de cálculos) -------------------------
function listarRescisoes(colaboradorId) {
  var ref = colecao("rescisoes");
  if (colaboradorId) ref = ref.where("colaboradorId", "==", colaboradorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataDemissao"); });
}
function salvarRescisao(rescisao) {
  var id = novoId("rescisoes");
  var dados = Object.assign({}, rescisao, {
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPor: usuarioAtual ? usuarioAtual.uid : null,
    criadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("rescisoes").doc(id).set(dados).then(function () { return id; });
}

// ------------------------- Prestadores PJ (Super Admin apenas) -------------------------
function listarPrestadoresPJ() {
  return colecao("prestadoresPJ").orderBy("nomeRazaoSocial").get().then(snapToList);
}
function salvarPrestadorPJ(pj) {
  var id = pj.id || novoId("prestadoresPJ");
  var dados = Object.assign({}, pj);
  delete dados.id;
  if (!pj.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("prestadoresPJ").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirPrestadorPJ(id) {
  return colecao("prestadoresPJ").doc(id).delete();
}

// ------------------------- Períodos de indisponibilidade de PJ (Super Admin apenas) -------------------------
// Não é férias CLT (PJ não tem esse direito) — é só uma agenda de quando o
// prestador avisou que não vai estar disponível.
function listarPjPeriodos(pjId) {
  var ref = colecao("pjPeriodos");
  if (pjId) ref = ref.where("prestadorId", "==", pjId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataInicio"); });
}
function salvarPjPeriodo(periodo) {
  var id = periodo.id || novoId("pjPeriodos");
  var dados = Object.assign({}, periodo);
  delete dados.id;
  if (!periodo.id) {
    dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    dados.criadoPor = usuarioAtual ? usuarioAtual.uid : null;
    dados.criadoPorNome = usuarioAtual ? usuarioAtual.nome : null;
  }
  return colecao("pjPeriodos").doc(id).set(comCarimbo(dados), { merge: true }).then(function () { return id; });
}
function excluirPjPeriodo(id) {
  return colecao("pjPeriodos").doc(id).delete();
}

// ------------------------- Ajustes salariais (CLT — histórico) -------------------------
// Normalmente cada ajuste vira um registro novo (não se edita), igual
// rescisões/distratos, pra manter o histórico íntegro. Esta função só grava
// o histórico — quem chama salvarAjusteSalarial() também precisa atualizar
// o salarioBase do colaborador separadamente (ver js/app.js).
// Só o Super Admin (único perfil que enxerga essa tela) também pode
// corrigir ou apagar um ajuste específico já registrado, via
// atualizarAjusteSalarial()/excluirAjusteSalarial() — pra consertar erro de
// digitação sem precisar mexer direto no Firebase Console.
function listarAjustesSalariais(colaboradorId) {
  var ref = colecao("ajustesSalariais");
  if (colaboradorId) ref = ref.where("colaboradorId", "==", colaboradorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataAjuste"); });
}
function salvarAjusteSalarial(ajuste) {
  var id = novoId("ajustesSalariais");
  var dados = Object.assign({}, ajuste, {
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPor: usuarioAtual ? usuarioAtual.uid : null,
    criadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("ajustesSalariais").doc(id).set(dados).then(function () { return id; });
}
function atualizarAjusteSalarial(id, dados) {
  var dadosComCarimbo = Object.assign({}, dados, {
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: usuarioAtual ? usuarioAtual.uid : null,
    atualizadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("ajustesSalariais").doc(id).set(dadosComCarimbo, { merge: true });
}
function excluirAjusteSalarial(id) {
  return colecao("ajustesSalariais").doc(id).delete();
}

// ------------------------- Ajustes de honorário PJ (histórico) -------------------------
// Mesma lógica do ajuste salarial de CLT, só que para o honorário mensal
// de prestadores PJ — inclusive a possibilidade de o Super Admin corrigir
// ou apagar um ajuste já registrado.
function listarAjustesHonorarioPJ(prestadorId) {
  var ref = colecao("ajustesHonorarioPJ");
  if (prestadorId) ref = ref.where("prestadorId", "==", prestadorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataAjuste"); });
}
function salvarAjusteHonorarioPJ(ajuste) {
  var id = novoId("ajustesHonorarioPJ");
  var dados = Object.assign({}, ajuste, {
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPor: usuarioAtual ? usuarioAtual.uid : null,
    criadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("ajustesHonorarioPJ").doc(id).set(dados).then(function () { return id; });
}
function atualizarAjusteHonorarioPJ(id, dados) {
  var dadosComCarimbo = Object.assign({}, dados, {
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: usuarioAtual ? usuarioAtual.uid : null,
    atualizadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("ajustesHonorarioPJ").doc(id).set(dadosComCarimbo, { merge: true });
}
function excluirAjusteHonorarioPJ(id) {
  return colecao("ajustesHonorarioPJ").doc(id).delete();
}

// ------------------------- Distratos de PJ (Super Admin apenas) -------------------------
// Histórico de encerramentos de contrato PJ — assim como em rescisões (CLT),
// cada cálculo vira um registro novo (não se edita depois), para manter o
// histórico íntegro.
function listarDistratosPJ(prestadorId) {
  var ref = colecao("distratosPJ");
  if (prestadorId) ref = ref.where("prestadorId", "==", prestadorId);
  return ref.get().then(snapToList).then(function (lista) { return ordenarPorDataDesc(lista, "dataEncerramento"); });
}
function salvarDistratoPJ(distrato) {
  var id = novoId("distratosPJ");
  var dados = Object.assign({}, distrato, {
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPor: usuarioAtual ? usuarioAtual.uid : null,
    criadoPorNome: usuarioAtual ? usuarioAtual.nome : null,
  });
  return colecao("distratosPJ").doc(id).set(dados).then(function () { return id; });
}

// ------------------------- util -------------------------
function snapToList(snap) {
  var lista = [];
  snap.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
  return lista;
}
