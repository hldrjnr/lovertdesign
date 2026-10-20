# Lista de problemas

- [ ] quando abro um projecto pelo explorer, enquanto tenho uma instancia do Lovert Design aberta, a nova janela fica branca e travada.
- [ ] a ferramenta de remoção de fundo por chromakey tem defeito, não reconhecendo direito as cores e limites, fazendo remoções de forma "suja"
- [ ] as camadas não estão a funcionar direito, tendo elementos a serem mal posicionados quando arrasto a ordem, grupos confusos e a impossibilidade de clicar com o botão direito para ter opções de acções a realizar no painel de layers
- [ ] quando aumento a escala da interface, os botões "vazam", e o primeiro é o de exportar. o que eu quero é que os botões do header estejam contidos em apenas 1 linha, e que, ao aumentar a escala da interface, eles virem só icones, para libertar espaço; mas antes, deve sumir o "- 100% +" quando não ouver espaço.
- [ ] quando quero editar  um gradiente radial, este é forçado a ficar linear, e tenho sempre que ir lá colocar como radial.
- [ ] quando clico para esconder ou trancar um grupo, todos elementos devem ser afectados do mesmo jeito; e para desfazer também deve funcionar para todos. o painel de layers deve estar preparado para isso


# Lista de mudanças a fazer

- [ ] o zoom deve acontecer apontando para o centro do canvas, e não pro lado esquerdo, como se fosse um livro
- [ ] ctrl+setas no editor devem servir para fazer "pan" no canvas
- [ ] quando seleciono um vector, o painel a direita deve estar com "transformação" fechado por padrão
- [ ] deve ter um vetor circulo e um rectângulo que vem com gradiente por padrão, mas esses gradientes não podem ser mudados, pois devem ser assim: gradiente radial, que mudo apenas a cor do centro, sendo transparente a cor de fora; um gradiente que vai da esquerda para a direita, mas com a cor da direita tambem sendo 100% transparente. esses elementos vectoriais devem ser funcionais e sem possibilidade de colocar contorno ou modificar o preenchimento, pois tal preenchimento já deve ser esse gradiente. a cor do gradiente deve ser selecionada normalmente no painel de propriedades, mas sempre continuando com o comportamento de gradiente com só 1 cor + outra com alpha=0
- [ ] as mascaras devem reconhecer objectos vectoriais também

# adições interessantes

- [ ] Google Fonts
- [ ] Presets de texto(refazer o sistema atual, para que apareçam os textos já aplicados num texto padrão tipo "ABCDabcd!", ao invés de um título que não mostra como o texto vai ficar.
- [ ] os botões que aparecem nos templates quando passo o mouse devem responder melhor quando o mouse passa por cima deles; deve ter 3 botões: editar, usar e eliminar: editar deve ser para editar o nome do template, e usar deve ser para abrir um novo projecto com o template.

# Serviço de IA imbutida
- [ ] IA integrada via API key: serve para criar novos projectos rapidamente e editar projectos já existentes de forma automática dentro do editor; a cração de projectos deve ser assim: quando o usuário pedir apenas 1 projecto, deve abrir este logo, mas quando for mais de um, este deve criar previews ainda no chat, de como vai estar no editor(100% fiel) e deve ter um botão para "escolher todos"(então vai salvar templates) ou simplesmente clicar em um deles para ir direto para o editor e continuar as alterações.
- [ ] A IA deve ter acesso a estrutura dos projectos, para que possa compreender como mexer neles, e deve ter a capacidade de mexer em projectos o editor em tempo real, de acordo com o pedido do usuário
- [ ] para situações em que o usuário precisa de templates que contenham imagens, a IA deve apenas usar imagens que devem vir por padrão dentro da app(e dependendo do contexto, ela deve 

