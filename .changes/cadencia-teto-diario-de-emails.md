---
impacto: capacidade_nova
secao: adicionado
titulo: Teto diário de e-mails de cadência (protege a caixa da instalação de banimento)
---

O worker de cadência agora respeita um teto diário de envio — padrão **60 e-mails/dia**, contado por instalação (é a mesma caixa/conta que atende todas as organizações do clone). Passado o teto, novos envios ficam adiados (reconferidos de hora em hora) até o teto liberar, em vez de continuar disparando e arriscar o provedor travar ou banir a caixa por volume.

Configurável por `CADENCIA_LIMITE_EMAILS_POR_DIA` (`.env`). Quem já está no ar não precisa mudar nada — o padrão de 60 entra sozinho.
