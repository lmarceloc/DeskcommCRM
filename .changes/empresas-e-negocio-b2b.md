---
impacto: capacidade_nova
secao: adicionado
titulo: Empresa, múltiplos contatos por negócio, termômetro, produto e anotações com @menção
---

O CRM ganha o modelo B2B que faltava: **Empresas** (`/app/companies`, nome/site/LinkedIn) vinculadas ao negócio, e um negócio agora pode ter **vários contatos** além do principal (financeiro, técnico, quem assina — seção "Outros contatos" no dossiê). O contato principal (`crm_leads.contact_id`) continua sendo quem recebe WhatsApp e entra em cadência de e-mail — nada disso muda.

No dossiê do negócio, três campos novos: **Empresa** (com criação na hora, sem sair da tela), **Termômetro** (sem interesse/frio/morno/quente/quase fechando — separado da etapa do funil: a etapa é onde o processo está, o termômetro é o quanto a pessoa parece querer comprar) e **Produto** (do catálogo que já existe em `/app/products`).

Nova seção **Anotações**: texto livre no negócio, com `@Nome Sobrenome` destacado visualmente quando bate com alguém da organização — sem notificar quem foi citado (decisão do dono do produto, por ora).

Ficha do contato ganha **Cargo** e **LinkedIn**.

**O que ainda não existe**: o disparo automático de WhatsApp para lead que abriu 3x+ não precisou de código novo — o "Abrir no WhatsApp" do dossiê (link `wa.me`, manual, sempre existiu) já cobre o caso quando combinado com a tela de leads quentes (PR separado). @menção não notifica ainda.

Não há ação para quem opera a VPS: a migration (0430, número pode mudar por colisão com outro PR em voo — conferir `checar:colisao-de-migration` antes de mesclar) é aditiva.
