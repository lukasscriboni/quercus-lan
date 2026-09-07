# Quercus para Windows

## Instalacion

1. Ejecuta `Quercus-Setup-1.0.0.exe`.
2. Elige la carpeta de instalacion y completa el asistente.
3. Abre **Quercus** desde el acceso directo del escritorio o el menu Inicio.
4. La primera vez, inicia sesion con tus credenciales habituales. En las siguientes aperturas, la sesion permanecera iniciada mientras siga vigente.

Windows puede mostrar una advertencia de SmartScreen porque este instalador local no tiene una firma digital comercial. Si el nombre del archivo coincide y lo recibiste directamente desde este proyecto, selecciona **Mas informacion** y luego **Ejecutar de todas formas**.

## Requisitos de esta version

- Esta version esta preparada para la computadora principal y usa la base de datos PostgreSQL que ya esta instalada en ella.
- El servicio de PostgreSQL debe estar iniciado antes de abrir Quercus.
- La aplicacion web en `localhost:3000` puede seguir utilizandose por separado.
- Desinstalar Quercus no elimina la base de datos ni los datos del negocio.
- No distribuyas este instalador a otras computadoras: contiene la configuracion de conexion de la computadora principal. Para puestos secundarios se generara una version cliente con conexion segura a la principal.
