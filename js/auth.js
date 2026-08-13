/*
 * Autenticação e perfil do usuário logado.
 *
 * Regras de perfil (mesmos 3 níveis da versão Python):
 *   - super_admin: acesso total, inclusive Prestadores PJ e cadastro de usuários.
 *   - admin: acesso total ao RH (colaboradores, ponto, férias, rescisão), MENOS Prestadores PJ e MENOS cadastro de usuários.
 *   - funcionario: autoatendimento — só vê/registra os próprios dados (colaboradorId vinculado).
 *
 * Importante: esconder botões/menus no HTML é só conforto de interface.
 * Quem garante de verdade que um "admin" não acessa Prestadores PJ, ou que
 * um "funcionario" não lê o registro de outra pessoa, são as regras do
 * Firestore (rules/firestore.rules) — que rodam no servidor do Google e
 * não podem ser burladas alterando o HTML/JS no navegador.
 */

var PERFIL_SUPER_ADMIN = "super_admin";
var PERFIL_ADMIN = "admin";
var PERFIL_FUNCIONARIO = "funcionario";
var LIMITE_CONTAS = 3;

var usuarioAtual = null; // { uid, nome, email, perfil, colaboradorId, ativo }
var authProntoCallbacks = [];

function onAuthPronto(cb) {
  if (usuarioAtual !== null || authJaResolveu) { cb(usuarioAtual); }
  else { authProntoCallbacks.push(cb); }
}
var authJaResolveu = false;

function carregarPerfilUsuario(firebaseUser) {
  return db.collection("usuarios").doc(firebaseUser.uid).get().then(function (doc) {
    if (!doc.exists) {
      // Login existe no Firebase Authentication mas ainda não tem perfil
      // cadastrado no Firestore (ex: conta criada direto no console do
      // Firebase). Sem perfil não há como saber o nível de acesso.
      return null;
    }
    var dados = doc.data();
    if (!dados.ativo) return { inativo: true };
    return {
      uid: firebaseUser.uid,
      nome: dados.nome || firebaseUser.email,
      email: firebaseUser.email,
      perfil: dados.perfil,
      colaboradorId: dados.colaboradorId || null,
      ativo: true,
    };
  });
}

function ehSuperAdmin() { return !!usuarioAtual && usuarioAtual.perfil === PERFIL_SUPER_ADMIN; }
// "admin comum" OU "super admin" — mesmo nome usado nas regras do Firestore
// (rules/firestore.rules) para manter as duas camadas de permissão em sincronia.
function ehAdminOuSuperAdmin() { return !!usuarioAtual && (usuarioAtual.perfil === PERFIL_ADMIN || usuarioAtual.perfil === PERFIL_SUPER_ADMIN); }
function ehFuncionario() { return !!usuarioAtual && usuarioAtual.perfil === PERFIL_FUNCIONARIO; }

/** Login por e-mail/senha. Retorna uma Promise. */
function fazerLogin(email, senha) {
  return auth.signInWithEmailAndPassword(email, senha);
}

function fazerLogout() {
  usuarioAtual = null;
  return auth.signOut();
}

/**
 * Cria um novo usuário (Auth + Firestore) sem encerrar a sessão do
 * Super Admin que está cadastrando. Usa uma segunda instância do app do
 * Firebase ("Secondary"), que é a forma recomendada de criar contas de
 * outras pessoas a partir do próprio navegador sem precisar de um backend.
 *
 * dados: { nome, email, senha, perfil, colaboradorId }
 */
function criarUsuario(dados) {
  var secondaryApp = firebase.apps.filter(function (a) { return a.name === "Secondary"; })[0];
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
  }
  var secondaryAuth = secondaryApp.auth();
  return secondaryAuth.createUserWithEmailAndPassword(dados.email, dados.senha)
    .then(function (cred) {
      var novoUid = cred.user.uid;
      return secondaryAuth.signOut().then(function () {
        return db.collection("usuarios").doc(novoUid).set({
          nome: dados.nome,
          email: dados.email,
          perfil: dados.perfil,
          colaboradorId: dados.colaboradorId || null,
          ativo: true,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          criadoPor: usuarioAtual ? usuarioAtual.uid : null,
        });
      }).then(function () { return novoUid; });
    });
}

/** Lista de usuários ativos+inativos, para a tela de gestão (Super Admin). */
function listarUsuarios() {
  return db.collection("usuarios").get().then(function (snap) {
    var lista = [];
    snap.forEach(function (doc) { lista.push(Object.assign({ id: doc.id }, doc.data())); });
    return lista;
  });
}

function contarUsuariosAtivos(lista) {
  return lista.filter(function (u) { return u.ativo; }).length;
}

function atualizarUsuario(uid, dados) {
  return db.collection("usuarios").doc(uid).update(dados);
}

function inativarUsuario(uid, ativo) {
  return db.collection("usuarios").doc(uid).update({ ativo: ativo });
}

// ---------------------------------------------------------------------
// Observa o estado de login e resolve o perfil assim que autenticado.
// Chamadores registram uma callback com onAuthPronto(function(usuario){...}).
// ---------------------------------------------------------------------
auth.onAuthStateChanged(function (firebaseUser) {
  if (!firebaseUser) {
    usuarioAtual = null;
    authJaResolveu = true;
    authProntoCallbacks.forEach(function (cb) { cb(null); });
    authProntoCallbacks = [];
    return;
  }
  carregarPerfilUsuario(firebaseUser).then(function (perfilResolvido) {
    if (!perfilResolvido || perfilResolvido.inativo) {
      usuarioAtual = null;
      authJaResolveu = true;
      authProntoCallbacks.forEach(function (cb) { cb({ semPerfil: !perfilResolvido, inativo: !!(perfilResolvido && perfilResolvido.inativo) }); });
      authProntoCallbacks = [];
      return;
    }
    usuarioAtual = perfilResolvido;
    authJaResolveu = true;
    authProntoCallbacks.forEach(function (cb) { cb(usuarioAtual); });
    authProntoCallbacks = [];
  });
});
