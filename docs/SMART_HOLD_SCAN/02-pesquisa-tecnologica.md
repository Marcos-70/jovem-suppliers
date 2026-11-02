# 2. Pesquisa tecnológica

*(Consultas feitas em Outubro de 2026. As listas de dispositivos mudam: confirme sempre nas páginas oficiais.)*

## 2.1 ARCore (Android)
- A Depth API produz mapas de profundidade a partir do movimento da câmara e **não exige sensor de profundidade dedicado**, mas **nem todos os dispositivos ARCore a suportam**; existe também profundidade «bruta» com mapa de confiança por pixel. O alcance e a precisão degradam-se com a distância.
- Fontes: documentação da Google — Depth / Raw Depth / Geospatial Depth (developers.google.com/ar/develop/…/depth).
- Lista de dispositivos: <https://developers.google.com/ar/devices> (verificar «Depth API» por modelo).

## 2.2 ARKit e LiDAR (Apple)
- A reconstrução de cena (malha) e a profundidade de cena do ARKit dependem do **scanner LiDAR**, presente em modelos **Pro** do iPhone (a partir do 12 Pro) e em iPad Pro recentes. A malha resultante pode ser irregular e depende do movimento do operador.
- Fontes: documentação ARKit/Unity (docs.unity3d.com — ARKit meshing) e sessões técnicas da Apple.
- Lista oficial: página técnica de cada modelo (procurar «LiDAR Scanner»).

## 2.3 WebXR (navegador)
- `hit-test` e `depth-sensing` existem em **Chrome/Edge para Android**; **Safari/iOS não suporta WebXR AR**. Logo, o LiDAR de iPhone não é acessível a partir de uma página web.
- Fonte: web-platform-dx (WebXR depth sensing / hit test) e developer.android.com/develop/xr/web.

## 2.4 Fotogrametria (SfM)
- A reconstrução a partir de fotografias não tem **escala absoluta** sem referência (barras de escala, pontos de controlo, medidor de distância).
- Superfícies sem textura (como grão uniforme ou chapa lisa), reflexos e pouca luz degradam a reconstrução.
- Fontes: literatura sobre estimação de escala em SfM (por exemplo arXiv 1906.08019) e guias de limitações de fotogrametria.

## 2.5 O que dizem os estudos sobre a precisão do LiDAR de telemóvel
- Estudos independentes com iPhone Pro reportam erros de **milímetros a poucos centímetros** em distâncias curtas (até cerca de 5 m), com **deriva** em percursos longos, dependência da app e vieses de alguns centímetros (por exemplo, avaliação do iPhone 13 Pro para aplicações de engenharia; estudos de adequação para BIM).
- Conclusão cautelosa: um porão tem dezenas de metros, muito acima do alcance útil em que estes valores foram medidos. **Não existe base para afirmar precisão em porões** sem ensaio próprio.

## 2.6 Contexto da carga a granel
- A prática estabelecida para quantificar carga em navios é a **vistoria de calados (draft survey)**, com incerteza reportada na ordem de décimas de percentagem em boas condições; sistemas de varrimento laser de pilhas reportam erros relativos de poucas décimas de percentagem. A densidade do granel (humidade, compactação) é uma fonte de erro própria.
- Fontes: bulk-online.com (medição de volume de granéis em navios) e literatura de varrimento laser de volume.
- Implicação: o volume (m³) **não é** peso (t). Qualquer cálculo futuro precisa de densidade validada e deve ser comparado com o método oficial acordado, não substituí-lo.

## 2.7 Dispositivos — resumo prático
| Objectivo | Dispositivos | Como |
|---|---|---|
| LiDAR de alta qualidade | iPhone Pro (12 Pro ou posterior), iPad Pro recente | App nativa/terceiros → importar PLY/GLB |
| Profundidade por ARCore | Android na lista ARCore com Depth | WebXR (Chrome) ou app nativa |
| Só pontos (hit-test) | Android ARCore | WebXR |
| Sem sensores especiais | Qualquer | Fotogrametria com escala conhecida → importar |

## 2.8 Como digitalizar porões com mais precisão (hipóteses a ensaiar)
1. **Várias estações** com sobreposição, em vez de um percurso único longo (menos deriva).
2. **Escala conhecida**: barras de escala/alvos e distâncias medidas com medidor laser dentro do porão.
3. **Fechar o circuito** (voltar ao ponto de partida) e comparar a deriva.
4. **Condições**: luz auxiliar, sem poeira em suspensão, superfícies com textura (alvos adesivos).
5. **Equipamento complementar** se o telemóvel não bastar: scanner laser terrestre ou drone — a decidir após o ensaio.
6. **Validar sempre** (documento 03) por dispositivo, método e condição.
