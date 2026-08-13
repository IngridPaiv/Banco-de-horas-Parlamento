# Como colocar o novo sistema de RH no ar

Este guia parte do que já existe: seu site atual em
`https://ingridpaiv.github.io/Banco-de-horas-Parlamento/`, que já usa o
mesmo projeto do Firebase (`horas-extras---parlamento`). Você **não**
precisa criar um projeto novo no Firebase nem uma conta nova no GitHub —
só vai publicar arquivos novos por cima e ajustar as regras de segurança.

Siga os passos nesta ordem. Cada um só demora alguns minutos.

---

## Passo 1 — Publicar as novas regras de segurança do Firestore

As regras são o que garante, de verdade, que um "Admin" comum não consegue
ver a aba de Prestadores PJ e que um "Funcionário" só vê os próprios dados
— mesmo que alguém tente burlar isso mexendo no código do navegador.

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e entre com a conta Google que administra o projeto.
2. Abra o projeto **horas-extras---parlamento**.
3. No menu à esquerda, clique em **Firestore Database**.
4. Clique na aba **Regras** (Rules), no topo.
5. Apague todo o conteúdo que estiver lá e cole o conteúdo do arquivo `rules/firestore.rules` (está dentro da pasta que você recebeu).
6. Clique em **Publicar** (Publish).

Pronto — a partir daqui, o banco de dados já está protegido pelas novas regras.

---

## Passo 2 — Criar sua conta de Super Admin

Como as regras só deixam **quem já é Super Admin** criar outras contas, a
sua conta (a primeira) precisa ser criada manualmente, uma única vez, direto
no Console do Firebase.

**2.1 — Criar o login (e-mail e senha):**

1. No menu à esquerda, clique em **Authentication**.
2. Clique em **Users** (Usuários) → **Add user** (Adicionar usuário).
3. Informe seu e-mail e uma senha (mínimo 6 caracteres). Clique em **Add user**.
4. Um novo usuário vai aparecer na lista, com um código longo na coluna **User UID** (algo como `aB3xQ...`). **Copie esse código** — você vai usar no próximo passo.

**2.2 — Dizer ao sistema que essa conta é Super Admin:**

1. Volte para **Firestore Database** → aba **Dados** (Data).
2. Clique em **Iniciar coleção** (Start collection).
3. ID da coleção: digite `usuarios` (exatamente assim, em minúsculas).
4. ID do documento: cole o **User UID** que você copiou no passo 2.1 (não use o "ID automático" — tem que ser exatamente esse código).
5. Adicione os seguintes campos ao documento:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `nome` | string | Seu nome, ex: `Ingrid Paiva` |
   | `email` | string | O mesmo e-mail do passo 2.1 |
   | `perfil` | string | `super_admin` |
   | `colaboradorId` | null | (deixe como null) |
   | `ativo` | boolean | `true` |

6. Clique em **Salvar**.

Pronto — essa conta agora consegue entrar no sistema com acesso total,
inclusive à aba **Prestadores PJ** e à aba **Usuários** (onde você cadastra
o login das outras pessoas depois, direto pela tela, sem precisar repetir
esse processo manual).

---

## Passo 3 — Migrar os dados do site antigo (recomendado)

Se você já tem funcionários e pontos registrados no site atual, não
precisa digitar tudo de novo. Veio junto um arquivo chamado
`migrar-dados-antigos.html` que copia automaticamente:

- os funcionários cadastrados → viram **colaboradores** no novo sistema;
- os registros de ponto já lançados;
- os ajustes (créditos/débitos) já lançados.

**Como rodar:**

1. Abra o arquivo `migrar-dados-antigos.html` direto no navegador (dois cliques nele funciona, não precisa estar publicado em lugar nenhum).
2. Entre com o e-mail e senha da conta Super Admin que você criou no Passo 2.
3. Clique em **Migrar dados agora** e acompanhe o andamento na caixa de texto.
4. Ao final, abra o novo sistema (`index.html`), entre como Super Admin e confira a aba **Colaboradores**.

⚠️ **Importante:** o site antigo não tinha campos de CPF, cargo nem data de
admissão. Depois da migração, edite cada colaborador na aba
**Colaboradores** e preencha pelo menos a **data de admissão** — sem ela, a
aba **Férias** não consegue calcular os períodos aquisitivos.

Depois que a migração der certo, você pode apagar o arquivo
`migrar-dados-antigos.html` (ele não precisa ir para o GitHub — é só uma
ferramenta de uso único).

---

## Passo 4 — Publicar o novo site no GitHub

1. Acesse o repositório `Banco-de-horas-Parlamento` no GitHub (o mesmo de sempre).
2. Apague os arquivos antigos do site (o `index.html` antigo, que tinha tudo em um arquivo só).
3. Envie os arquivos novos, mantendo a mesma estrutura de pastas:
   - `index.html`
   - pasta `css/` (com `style.css`)
   - pasta `js/` (com todos os arquivos `.js`)
   - **não é necessário** enviar as pastas `rules/`, `docs/` nem o arquivo `migrar-dados-antigos.html` — eles são só para configuração, não fazem parte do site publicado.
4. Aguarde 1–2 minutos e acesse `https://ingridpaiv.github.io/Banco-de-horas-Parlamento/` para conferir.

Se preferir, pode arrastar e soltar os arquivos direto pela interface do
GitHub no navegador — mesmo jeito que você já usa hoje.

---

## Passo 5 — Testar

1. Acesse o site publicado e entre com a conta Super Admin.
2. Confira a aba **Colaboradores**: os dados migrados estão lá? Complete o que faltar.
3. Vá em **Usuários** e cadastre o login das outras 1–2 pessoas que vão usar o sistema, escolhendo o perfil certo para cada uma (**Admin/RH** ou **Funcionário**, vinculando ao colaborador certo).
4. Peça para essa pessoa entrar pelo link do site com o e-mail e senha que você cadastrou, e confirmar que só vê o que deveria ver.

---

## Perguntas comuns

**Por que só eu vejo a aba "Prestadores PJ"?**
Porque essa restrição foi pedida especificamente para esse módulo, e ela é
garantida nas regras do Firestore (Passo 1) — não dá para outra pessoa
acessar isso mesmo tentando digitar o endereço certo ou mexer no código.

**Posso mudar quem é Super Admin depois?**
Sim, direto na aba **Usuários**, editando o perfil de uma conta existente
— mas por segurança essa edição só outro Super Admin consegue fazer.

**O cálculo de rescisão substitui um contador?**
Não. Ele é uma estimativa de apoio (está avisado na própria tela) — não
inclui FGTS, INSS/IRRF nem convenções coletivas. Sempre confira com
profissional de contabilidade antes de qualquer pagamento real.

**Esqueci a senha da conta Super Admin.**
No Console do Firebase, em **Authentication → Users**, você pode redefinir
a senha de qualquer conta (inclusive a sua) a qualquer momento.
