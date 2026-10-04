# Ariza · Minimal HUD

Dirección visual inspirada en los paneles flotantes de Apple, aplicada a un ERP de uso diario. El archivo `hud-kit.css` contiene los tokens y tratamientos compartidos.

## Fundamentos

- Fondo gris perla `#f2f3f5`, superficies blancas y texto grafito `#202124`.
- Azul `#0066cc` para acciones principales, enlaces y foco.
- Verde `#237b45`, ámbar `#996000` y rojo `#c4313b` para estados, siempre acompañados de texto.
- Tipografía nativa de Apple cuando esté disponible; Avenir Next o Segoe UI como alternativas locales.
- Texto operativo de 12–14 px; encabezados de sección de 18 px; títulos de página de 27–36 px.
- Espaciado basado en múltiplos de 4 px. Controles de 40–42 px y paneles con 20–24 px de relleno.

## Componentes

- Paneles: blanco casi opaco, radio de 20 px, borde fino y sombra discreta para conservar la claridad de los datos.
- Navegación, avisos flotantes y modal: transparencia con desenfoque y alternativa sólida si el navegador no lo soporta.
- Botón principal azul; secundarios blancos; acciones menores como enlaces.
- Tablas con separadores horizontales, cifras tabulares y desplazamiento horizontal en pantallas pequeñas.
- Controles segmentados con fondo gris y selección blanca.
- Foco visible para teclado y respeto por la preferencia de movimiento reducido.

## Uso

Cargar `hud-kit.css` después de los estilos estructurales. Reutilizar las variables de `:root` y las clases existentes (`panel`, `primary`, `secondary`, `pill`, `tabs`, `toast`) al extender las pantallas.

El frontend actual sigue siendo una demostración con datos de ejemplo; este kit modifica su presentación.
