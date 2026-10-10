---
impacto: exige_acao
secao: corrigido
titulo: Documentos pessoais cifrados e webhook global protegido no Coolify
---
Antes de atualizar o app, aplique a migration 0447 e mantenha CPF_ENCRYPTION_KEY. O compose de Coolify atualiza também o transporte: entrega pela rede interna e envia a credencial de webhook; não atualize somente um dos lados. Criação, edição e importação de documentos recusam falha de cifra em vez de gravar hash sem cifra. Descifrar exige manager/admin com vínculo aceito e vigente no mesmo tenant. Fusos inválidos são recusados e o dinheiro no inbox e PDF segue a moeda do negócio. As imagens continuam imutáveis: escolha APP_IMAGE, WORKER_IMAGE e SCHEDULER_IMAGE da mesma versão publicada e verificada antes do deploy.

A instalação tradicional volta a ter Caddy completo, e os overrides deixam de referenciar o serviço de telefonia ausente. O compose de Coolify continua com seis serviços.

## Requer atenção

Aplique a migration 0447, preserve CPF_ENCRYPTION_KEY e atualize app e transporte juntos. Escolha imagens publicadas e verificadas da mesma versão antes de desplegar; mantenha um respaldo do banco e dos volumes.
