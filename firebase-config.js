/*
 * Configuração do Firebase — mesmo projeto já usado no site atual
 * (https://ingridpaiv.github.io/Banco-de-horas-Parlamento/), então as
 * pessoas que já existirem como usuário no Firebase Authentication desse
 * projeto continuam funcionando normalmente.
 *
 * Esses valores (apiKey, authDomain, etc.) NÃO são segredos — é a mesma
 * config que já fica visível no código-fonte do site publicado no GitHub
 * Pages. A segurança de verdade fica nas regras do Firestore
 * (rules/firestore.rules) e no Firebase Authentication, não em esconder
 * esses valores.
 */
var firebaseConfig = {
  apiKey: "AIzaSyD4NtYsfS17t4T4DLEZxTbeyIedtWvat4g",
  authDomain: "horas-extras---parlamento.firebaseapp.com",
  projectId: "horas-extras---parlamento",
  storageBucket: "horas-extras---parlamento.firebasestorage.app",
  messagingSenderId: "388633924074",
  appId: "1:388633924074:web:72b3e312d3de91c8dde293",
};

firebase.initializeApp(firebaseConfig);

var db = firebase.firestore();
var auth = firebase.auth();
