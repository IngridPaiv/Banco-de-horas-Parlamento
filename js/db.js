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
  return ref.orderBy("data", "desc").get().then(snapToList);
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
  return ref.orderBy("data", "desc").get().then(snapToList);
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
  return ref.orderBy("dataInicio", "desc").get().then(snapToList);
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
  return ref.orderBy("dataDemissao", "desc").get().then(snapToList);
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
  return ref.orderBy("dataInicio", "desc").get().then(snapToList);
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

// ------------------------- Distratos de PJ (Super Admin apenas) -------------------------
// Histórico de encerramentos de contrato PJ — assim como em rescisões (CLT),
// cada cálculo vira um registro novo (não se edita depois), para manter o
// histórico íntegro.
function listarDistratosPJ(prestadorId) {
  var ref = colecao("distratosPJ");
  if (prestadorId) ref = ref.where("prestadorId", "==", prestadorId);
  return ref.orderBy("dataEncerramento", "desc").get().then(snapToList);
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
