---
impacto: capacidade_nova
secao: adicionado
titulo: Cadência de e-mail passa a enviar de verdade, com rastreio de abertura e tela de leads quentes
---

O worker `cadencia-worker` (cron, minuto a minuto) agora anda a fila de inscrições: envia o e-mail (com as variáveis do lead substituídas), avança esperas em dias úteis, executa ramificações por abertura, cria a tarefa do passo, e para a inscrição quando o negócio fecha (se a cadência tiver essa parada ligada). Cada e-mail carrega um pixel de rastreio e um link de descadastro — clicar nele suprime o CONTATO em todas as cadências da organização, não só na que originou o clique.

Nova tela **`/app/hot-leads`** ("Leads quentes"): todo lead que abriu o mesmo e-mail de uma cadência 3 vezes ou mais aparece ali, com link direto pro negócio no funil.

**O que ainda não existe**: o passo de WhatsApp da cadência não envia — a inscrição para com aviso na Atividade em vez de arriscar a conexão do cliente sem o pipeline de anti-banimento. As condições "clicou" e "respondeu" de um ramo nunca resolvem para "sim" (sem rastreio de clique nem leitura de resposta ainda) — aguardam o prazo e seguem por "não". Envio continua pelo transporte único da instalação (SMTP/Resend); não existe caixa de e-mail por vendedor.

Não há ação para quem opera a VPS: a migration é aditiva.
