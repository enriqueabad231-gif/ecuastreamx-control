# EcuastreamX en Cloudflare Workers + D1

Este proyecto es la conversión de la aplicación que antes dependía de Google Apps Script y Google Sheets.

## Qué conserva

- Inicio de sesión privado.
- Dashboard mensual.
- Registro, edición y eliminación de pagos.
- Registro, edición y eliminación de gastos.
- Clientes activos, por vencer y vencidos.
- Botones de cobro por WhatsApp.
- Grupos por plataforma y cinco espacios por cuenta.
- Contraseñas y PIN cifrados en D1 con AES-GCM.

## Requisitos

1. Una cuenta de Cloudflare.
2. Node.js instalado.
3. El dominio administrado dentro de Cloudflare.

## Instalación

Abre una terminal dentro de esta carpeta:

```bash
npm install
npx wrangler login
```

### 1. Crear la base de datos D1

```bash
npx wrangler d1 create ecuastreamx-db
```

Cloudflare mostrará un `database_id`. Copia ese valor y reemplaza:

```text
REEMPLAZA_CON_EL_ID_DE_TU_D1
```

en `wrangler.jsonc`.

### 2. Crear las tablas

```bash
npm run db:remote
```

### 3. Configurar secretos

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put DATA_ENCRYPTION_KEY
```

- `ADMIN_PASSWORD`: la contraseña con la que entrarás al panel.
- `DATA_ENCRYPTION_KEY`: una frase larga, privada y estable. No la cambies después de guardar cuentas o no se podrán descifrar las claves ya almacenadas.
- El usuario inicial está configurado como `admin` en `wrangler.jsonc`.

### 4. Publicar

```bash
npm run deploy
```

Al terminar recibirás una dirección parecida a:

```text
https://ecuastreamx-control.<tu-subdominio>.workers.dev
```

## Conectar tu dominio

En Cloudflare entra a:

```text
Workers & Pages
→ ecuastreamx-control
→ Settings
→ Domains & Routes
→ Add → Custom Domain
```

Puedes conectar, por ejemplo:

```text
panel.ecuastreamx.com
```

También puedes añadirlo directamente en `wrangler.jsonc`:

```jsonc
"routes": [
  {
    "pattern": "panel.ecuastreamx.com",
    "custom_domain": true
  }
]
```

## Probar localmente

Copia el archivo de ejemplo:

```bash
cp .dev.vars.example .dev.vars
```

Edita sus valores y ejecuta:

```bash
npm run db:local
npm run dev
```

Después abre la dirección que muestre Wrangler, normalmente `http://localhost:8787`.

## Logo

Reemplaza `public/logo.svg` por tu logo. Conserva el mismo nombre o modifica el método `obtenerLogoBase64` en `src/worker.js`.

## Migrar datos antiguos

La estructura ya está preparada para D1, pero los datos existentes en Google Sheets no se transfieren automáticamente. Antes de apagar Apps Script, exporta las hojas `PAGOS`, `GASTOS` y `PLATAFORMAS_DETALLE` como CSV y conviértelas al esquema de `schema.sql`.

## Seguridad

- No publiques `.dev.vars`.
- No escribas la contraseña administrativa dentro del código.
- Mantén estable `DATA_ENCRYPTION_KEY` y guárdala en un lugar seguro.
- Este panel muestra credenciales de plataformas a quien inicie sesión; usa una contraseña administrativa fuerte.
