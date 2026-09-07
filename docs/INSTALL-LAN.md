# Instalación en la PC servidor Windows

Esta guía parte de una PC Windows limpia. Internet sólo puede ser necesario para descargar instaladores y paquetes una vez; terminada la instalación, Quercus funciona sin Internet.

## 1. Preparar la red

1. Conecte el servidor y todas las terminales al mismo router o switch.
2. En Windows, configure la red del servidor como **Privada**.
3. En el router, cree una **reserva DHCP** para la MAC del servidor. Es preferible a fijar la IP manualmente porque evita conflictos.
4. Elija una dirección disponible, por ejemplo `192.168.1.100`. Quercus no depende de ese número exacto.
5. En el servidor, ejecute `ipconfig` para confirmar la dirección IPv4.

## 2. Instalar PostgreSQL local

Instale una versión soportada de PostgreSQL 16 o posterior para Windows. Durante el instalador:

- conserve el puerto `5432`;
- defina una contraseña fuerte para el usuario administrador `postgres`;
- instale Command Line Tools (`psql`, `pg_dump`, `pg_restore`);
- pgAdmin es opcional pero práctico.

Abra **SQL Shell (psql)** o Query Tool de pgAdmin como `postgres` y ejecute, cambiando la contraseña:

```sql
CREATE ROLE quercus_app LOGIN PASSWORD 'UNA_CLAVE_LARGA_Y_UNICA';
CREATE DATABASE quercus OWNER quercus_app ENCODING 'UTF8';
REVOKE ALL ON DATABASE quercus FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE quercus TO quercus_app;
```

En `postgresql.conf` mantenga:

```text
listen_addresses = 'localhost'
port = 5432
password_encryption = 'scram-sha-256'
```

En `pg_hba.conf`, la conexión de la aplicación debe limitarse a loopback:

```text
host    quercus    quercus_app    127.0.0.1/32    scram-sha-256
host    quercus    quercus_app    ::1/128         scram-sha-256
```

Reinicie el servicio PostgreSQL después de cambiar su configuración. No cree una regla de firewall para TCP 5432.

## 3. Instalar Node.js y el proyecto

Instale Node.js 22 LTS de 64 bits para todos los usuarios. Copie la carpeta `quercus-lan` a una ubicación estable, por ejemplo `C:\BarSystem\quercus-lan`.

Abra PowerShell dentro de esa carpeta:

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Para una instalación completamente offline, prepare previamente en otra PC los instaladores de PostgreSQL/Node y un paquete del proyecto que incluya el store de pnpm. El uso diario no hace ninguna descarga.

## 4. Configurar `.env`

Edite `.env` y reemplace todos los valores de ejemplo:

```dotenv
DATABASE_URL="postgresql://quercus_app:UNA_CLAVE_LARGA_Y_UNICA@localhost:5432/quercus?schema=public"
SESSION_SECRET="UN_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES"
APP_NAME="Quercus"
PORT="3000"
BACKUP_DIR="C:\\BarSystem\\backups"
SESSION_HOURS="12"
```

Si la contraseña de PostgreSQL contiene caracteres como `@`, `:`, `/`, `?` o `#`, codifíquela como URL antes de colocarla en `DATABASE_URL`.

Para generar `SESSION_SECRET` de forma segura en PowerShell:

```powershell
$secretBytes = New-Object byte[] 48
$randomSource = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomSource.GetBytes($secretBytes)
[Convert]::ToBase64String($secretBytes)
$randomSource.Dispose()
```

## 5. Crear estructura y datos iniciales

```powershell
pnpm db:validate
pnpm db:migrate
pnpm db:seed
```

El seed crea Quercus, la sucursal Principal, Depósito principal, Salón/Patio/Barra, estaciones BAR/COCINA, medios de pago, cuatro usuarios y sólo cuatro productos de demostración. Las contraseñas se guardan hasheadas.

## 6. Compilar e iniciar

Desarrollo (sólo para cambios y pruebas):

```powershell
pnpm dev
# Equivalente: npm run dev
```

Producción local para la jornada:

```powershell
pnpm build
pnpm start
# Equivalentes: npm run build / npm run start
```

El script `start` ejecuta Next.js en modo producción y escucha en `0.0.0.0:3000`. No use `pnpm dev` para la jornada del bar.

Compruebe en el servidor:

- aplicación: `http://localhost:3000`;
- salud: `http://localhost:3000/api/health`;
- respuesta esperada: `{"status":"ok","database":"ok",...}`.

## 7. Permitir acceso LAN en el firewall

Abra PowerShell **como administrador** y ejecute:

```powershell
.\scripts\configure-firewall.ps1 -Port 3000
```

La regla acepta TCP 3000 solamente desde la subred local y sólo cuando Windows reconoce la red como Privada. No habilita redes Públicas ni TCP 5432.

## 8. Conectar las otras PCs y tablets

En cada terminal:

1. Conéctese al mismo router del servidor.
2. Abra un navegador moderno.
3. Ingrese `http://IP-DEL-SERVIDOR:3000`; por ejemplo `http://192.168.1.100:3000`.
4. Inicie sesión con su usuario de caja, mozo, cocina o administración.

Si no abre, confirme: IP del servidor, red Privada, regla de firewall, misma subred y que `pnpm start` esté activo. No configure PostgreSQL en las PCs clientes.

## 9. Inicio automático al encender Windows

Primero confirme que `pnpm build` y `pnpm start` funcionan. Luego abra PowerShell como administrador:

```powershell
.\scripts\install-autostart.ps1
Start-ScheduledTask -TaskName "Quercus LAN Server"
```

El Programador de tareas ejecutará `scripts/start-production.ps1` al iniciar Windows, oculto, con reintentos si falla. Para quitarlo:

```powershell
.\scripts\uninstall-autostart.ps1
```

Después de actualizar la aplicación, detenga la tarea, ejecute migraciones y `pnpm build`, y vuelva a iniciarla.

## 10. Backups locales

Backup manual:

```powershell
.\scripts\backup-db.ps1
```

El destino predeterminado viene de `BACKUP_DIR`. El archivo usa fecha y hora, por ejemplo `bar_2026-08-29_2300.backup`.

Para programarlo todos los días a las 23:00, ejecute como administrador:

```powershell
.\scripts\install-backup-task.ps1 -At "23:00"
```

Copie periódicamente backups a un segundo disco local o NAS del establecimiento. Pruebe una restauración en una base separada al menos una vez por mes.

Restaurar sobre la base configurada reemplaza los objetos existentes. Detenga Quercus, haga un backup adicional y ejecute:

```powershell
Stop-ScheduledTask -TaskName "Quercus LAN Server"
.\scripts\restore-db.ps1 -BackupFile "C:\BarSystem\backups\bar_FECHA.backup"
Start-ScheduledTask -TaskName "Quercus LAN Server"
```

El script exige escribir `RESTAURAR` antes de continuar, salvo que un administrador use explícitamente `-Force`.

## 11. Credenciales iniciales

- `admin / admin123`
- `cajero / cajero123`
- `mozo / mozo123`
- `cocina / cocina123`

Cambie las cuatro contraseñas antes de operar con datos reales. No comparta la cuenta `admin` para tareas diarias.
