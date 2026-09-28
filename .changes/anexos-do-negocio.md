---
impacto: capacidade_nova
secao: adicionado
titulo: Anexo no negócio, com link permanente pra mandar ao cliente
---

O dossiê do negócio ganha uma seção **Anexos**: sobe PDF, JPEG, PNG ou Word (.doc/.docx), até 20 MB, guardado num bucket próprio (`deal-attachments`) no Supabase Storage do cliente.

A ação principal é **Copiar link** — uma URL do próprio CRM (`/api/v1/anexos/{id}`) que nunca expira, pensada pra mandar a proposta/contrato/orçamento pro cliente sem enviar o arquivo pelo WhatsApp. Apagar o anexo é o único jeito de revogar o link.

Não há ação para quem opera a VPS: a migration (0429) é aditiva e cria o bucket sozinha.
