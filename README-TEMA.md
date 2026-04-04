# Pacote de correção do tema

Este pacote contém **arquivos de substituição** para corrigir o comportamento do tema claro/escuro no repositório `ThiagoAboo/bot-cripto-ia`.

## O que este pacote faz
- centraliza as cores do app em variáveis CSS
- corrige o `ThemeProvider`
- remove a dependência de classes “dark-only” em componentes compartilhados
- corrige a sidebar, header e footer para respeitarem o tema ativo
- corrige a tela de treinamento e o seletor de dataset, que são os pontos mostrados nas imagens

## Como aplicar
1. Faça backup do projeto atual.
2. Copie a pasta `src` deste pacote para a raiz do seu repositório.
3. Substitua os arquivos existentes quando o Windows pedir confirmação.
4. Rode:
   ```bash
   npm install
   npm run dev
   ```
5. Limpe o cache do navegador e remova `theme` do `localStorage` se quiser testar do zero.

## Observação importante
Eu não consegui clonar o repositório diretamente neste ambiente, então o pacote foi montado como **overlay de arquivos** para sobrescrever no projeto existente, e não como um ZIP completo do repositório inteiro.
