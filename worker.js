const TIME_ZONE = "America/Guayaquil";
const DAYS_PER_MONTH = 30;
const PLATFORMS = [
  "Netflix",
  "Spotify",
  "Disney Standard",
  "Disney ESPN",
  "Max",
  "Prime Video"
];

const ALLOWED_RPC_METHODS = new Set([
  "login",
  "obtenerLogoBase64",
  "obtenerDashboard",
  "registrarPago",
  "obtenerPagoPorId",
  "actualizarPago",
  "eliminarPago",
  "registrarGasto",
  "obtenerGastoPorId",
  "actualizarGasto",
  "eliminarGasto",
  "obtenerSiguienteGrupoPlataforma",
  "guardarGrupoPlataforma",
  "actualizarGrupoPlataforma",
  "eliminarGrupoPlataforma",
  "obtenerGruposPlataformas"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "ecuastreamx-control" });
    }

    if (url.pathname === "/api/rpc") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Método no permitido." }, 405);
      }
      return handleRpc(request, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .bind(Date.now())
        .run()
    );
  }
};

async function handleRpc(request, env) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_000_000) {
      return json({ ok: false, error: "Solicitud demasiado grande." }, 413);
    }

    const body = await request.json();
    const method = cleanText(body?.method);
    const args = Array.isArray(body?.args) ? body.args : [];

    if (!ALLOWED_RPC_METHODS.has(method)) {
      return json({ ok: false, error: "Método no autorizado." }, 404);
    }

    const result = await RPC[method](env, ...args);
    return json({ ok: true, result });
  } catch (error) {
    console.error(error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Error interno."
    }, 400);
  }
}

const RPC = {
  async login(env, usuario, clave) {
    if (!env.ADMIN_PASSWORD) {
      throw new Error("Falta configurar el secreto ADMIN_PASSWORD en Cloudflare.");
    }

    const expectedUser = String(env.ADMIN_USER || "admin");
    const validUser = await constantTimeEqual(String(usuario || ""), expectedUser);
    const validPassword = await constantTimeEqual(String(clave || ""), String(env.ADMIN_PASSWORD));

    if (!validUser || !validPassword) {
      return { ok: false, mensaje: "Usuario o contraseña incorrectos." };
    }

    const token = `${crypto.randomUUID()}-${randomHex(24)}`;
    const tokenHash = await sha256Hex(token);
    const hours = Math.max(1, Number(env.SESSION_HOURS || 6));
    const now = Date.now();
    const expiresAt = now + hours * 60 * 60 * 1000;

    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
      env.DB.prepare(
        "INSERT INTO sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)"
      ).bind(tokenHash, expectedUser, expiresAt, now)
    ]);

    return { ok: true, token, usuario: expectedUser };
  },

  async obtenerLogoBase64() {
    return "/logo.svg";
  },

  async registrarPago(env, token, pago = {}) {
    await validateToken(env, token);

    const row = normalizePayment(pago);
    await env.DB.prepare(`
      INSERT INTO payments (
        id, payment_date, customer, platform, service_type, phone,
        months, amount, start_date, cut_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      row.id, row.paymentDate, row.customer, row.platform, row.serviceType,
      row.phone, row.months, row.amount, row.startDate, row.cutDate, row.notes
    ).run();

    return { ok: true, mensaje: "Pago registrado correctamente." };
  },

  async obtenerPagoPorId(env, token, idPago) {
    await validateToken(env, token);
    const row = await env.DB.prepare("SELECT * FROM payments WHERE id = ?")
      .bind(String(idPago || ""))
      .first();

    if (!row) return { ok: false, mensaje: "No se encontró el pago." };

    return {
      ok: true,
      pago: {
        id: row.id,
        fechaPago: row.payment_date,
        usuario: row.customer,
        plataforma: row.platform,
        tipo: row.service_type,
        telefono: row.phone,
        meses: row.months,
        montoPagado: row.amount,
        fechaInicio: row.start_date,
        observacion: row.notes || ""
      }
    };
  },

  async actualizarPago(env, token, pago = {}) {
    await validateToken(env, token);
    const id = cleanText(pago.id);
    if (!id) throw new Error("Falta el ID del pago.");

    const existing = await env.DB.prepare("SELECT id FROM payments WHERE id = ?").bind(id).first();
    if (!existing) return { ok: false, mensaje: "No se encontró el pago para editar." };

    const row = normalizePayment({ ...pago, id });
    await env.DB.prepare(`
      UPDATE payments SET
        payment_date = ?, customer = ?, platform = ?, service_type = ?, phone = ?,
        months = ?, amount = ?, start_date = ?, cut_date = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      row.paymentDate, row.customer, row.platform, row.serviceType, row.phone,
      row.months, row.amount, row.startDate, row.cutDate, row.notes, id
    ).run();

    return { ok: true, mensaje: "Pago actualizado correctamente." };
  },

  async eliminarPago(env, token, idPago) {
    await validateToken(env, token);
    const result = await env.DB.prepare("DELETE FROM payments WHERE id = ?")
      .bind(String(idPago || ""))
      .run();

    return result.meta.changes
      ? { ok: true, mensaje: "Pago eliminado correctamente." }
      : { ok: false, mensaje: "No se encontró el pago." };
  },

  async registrarGasto(env, token, gasto = {}) {
    await validateToken(env, token);
    const row = normalizeExpense(gasto);

    await env.DB.prepare(`
      INSERT INTO expenses (
        id, expense_date, category, platform, description, amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      row.id, row.expenseDate, row.category, row.platform, row.description, row.amount
    ).run();

    return { ok: true, mensaje: "Gasto registrado correctamente." };
  },

  async obtenerGastoPorId(env, token, idGasto) {
    await validateToken(env, token);
    const row = await env.DB.prepare("SELECT * FROM expenses WHERE id = ?")
      .bind(String(idGasto || ""))
      .first();

    if (!row) return { ok: false, mensaje: "No se encontró el gasto." };

    return {
      ok: true,
      gasto: {
        id: row.id,
        fecha: row.expense_date,
        categoria: row.category,
        plataforma: row.platform,
        descripcion: row.description,
        monto: row.amount
      }
    };
  },

  async actualizarGasto(env, token, gasto = {}) {
    await validateToken(env, token);
    const id = cleanText(gasto.id);
    if (!id) throw new Error("Falta el ID del gasto.");

    const existing = await env.DB.prepare("SELECT id FROM expenses WHERE id = ?").bind(id).first();
    if (!existing) return { ok: false, mensaje: "No se encontró el gasto para editar." };

    const row = normalizeExpense({ ...gasto, id });
    await env.DB.prepare(`
      UPDATE expenses SET
        expense_date = ?, category = ?, platform = ?, description = ?, amount = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      row.expenseDate, row.category, row.platform, row.description, row.amount, id
    ).run();

    return { ok: true, mensaje: "Gasto actualizado correctamente." };
  },

  async eliminarGasto(env, token, idGasto) {
    await validateToken(env, token);
    const result = await env.DB.prepare("DELETE FROM expenses WHERE id = ?")
      .bind(String(idGasto || ""))
      .run();

    return result.meta.changes
      ? { ok: true, mensaje: "Gasto eliminado correctamente." }
      : { ok: false, mensaje: "No se encontró el gasto." };
  },

  async obtenerDashboard(env, token) {
    await validateToken(env, token);

    const [paymentsResult, expensesResult, detailsResult] = await Promise.all([
      env.DB.prepare("SELECT * FROM payments ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT * FROM expenses ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT * FROM platform_details ORDER BY created_at DESC").all()
    ]);

    const payments = paymentsResult.results || [];
    const expenses = expensesResult.results || [];
    const details = detailsResult.results || [];
    const currentMonth = todayInGuayaquil().slice(0, 7);

    let ingresosMes = 0;
    let gastosMes = 0;
    let activos = 0;
    let porVencer = 0;
    let vencidos = 0;
    let venceHoy = 0;

    const plataformas = Object.fromEntries(PLATFORMS.map(name => [name, 0]));
    const listaPorVencer = [];
    const listaVencidos = [];
    const ultimosPagos = [];
    const ultimosGastos = [];

    for (const row of payments) {
      const info = expirationInfo(row.cut_date);
      const monto = Number(row.amount || 0);

      if (String(row.payment_date || "").slice(0, 7) === currentMonth) {
        ingresosMes += monto;
        if (Object.hasOwn(plataformas, row.platform)) plataformas[row.platform] += monto;
      }

      if (info.estado === "ACTIVO") activos++;
      if (info.estado === "POR VENCER") porVencer++;
      if (info.estado === "VENCE HOY") venceHoy++;
      if (["VENCIDO", "VENCE HOY"].includes(info.estado) || info.diasRestantes === 0) vencidos++;

      const message = createPaymentMessage(row.customer, row.platform, monto, row.cut_date);
      const item = {
        id: row.id,
        usuario: row.customer,
        plataforma: row.platform,
        tipo: row.service_type,
        telefono: row.phone,
        meses: Number(row.months || 0),
        monto,
        fechaPago: row.payment_date,
        fechaInicio: row.start_date,
        fechaCorte: row.cut_date,
        diasRestantes: info.diasRestantes,
        estado: info.estado,
        whatsapp: createWhatsAppLink(row.phone, message),
        observacion: row.notes || "",
        origen: "pago"
      };

      if (info.estado === "POR VENCER") listaPorVencer.push(item);
      if (["VENCIDO", "VENCE HOY"].includes(info.estado) || info.diasRestantes === 0) {
        listaVencidos.push(item);
      }
      ultimosPagos.push(item);
    }

    for (const row of expenses) {
      const monto = Number(row.amount || 0);
      if (String(row.expense_date || "").slice(0, 7) === currentMonth) gastosMes += monto;

      ultimosGastos.push({
        id: row.id,
        fecha: row.expense_date,
        categoria: row.category,
        plataforma: row.platform,
        descripcion: row.description,
        monto
      });
    }

    for (const row of details) {
      if (!row.cut_date) continue;
      const info = expirationInfo(row.cut_date);
      const item = {
        id: row.id,
        usuario: row.display_name || `${row.group_name} ${row.space}`,
        plataforma: row.platform,
        tipo: `${row.detail_type} · ${row.space}`,
        telefono: "—",
        meses: "",
        monto: 0,
        fechaPago: "",
        fechaInicio: row.start_date || "",
        fechaCorte: row.cut_date || "",
        diasRestantes: info.diasRestantes,
        estado: info.estado,
        whatsapp: "",
        observacion: row.notes || "",
        origen: "plataforma"
      };

      if (info.estado === "POR VENCER") listaPorVencer.push(item);
      if (["VENCIDO", "VENCE HOY"].includes(info.estado) || info.diasRestantes === 0) {
        listaVencidos.push(item);
      }
    }

    listaPorVencer.sort((a, b) => Number(a.diasRestantes) - Number(b.diasRestantes));
    listaVencidos.sort((a, b) => Number(a.diasRestantes) - Number(b.diasRestantes));

    return {
      mesActual: currentMonth,
      ingresosMes,
      gastosMes,
      netoMes: ingresosMes - gastosMes,
      activos,
      porVencer,
      venceHoy,
      vencidos,
      plataformas,
      listaPorVencer,
      listaVencidos,
      ultimosPagos: ultimosPagos.slice(0, 30),
      ultimosGastos: ultimosGastos.slice(0, 30)
    };
  },

  async obtenerSiguienteGrupoPlataforma(env, token, plataforma) {
    await validateToken(env, token);
    const platform = cleanText(plataforma);
    const result = await env.DB.prepare(
      "SELECT DISTINCT group_name FROM platform_details WHERE platform = ?"
    ).bind(platform).all();

    let max = 0;
    for (const row of result.results || []) {
      const match = String(row.group_name || "").match(/Grupo\s+(\d+)/i);
      if (match) max = Math.max(max, Number(match[1]));
    }

    return `${platform} Grupo ${max + 1}`;
  },

  async guardarGrupoPlataforma(env, token, grupo = {}) {
    await validateToken(env, token);
    await savePlatformGroup(env, grupo, null);
    return { ok: true, mensaje: "Grupo guardado correctamente." };
  },

  async actualizarGrupoPlataforma(env, token, grupo = {}) {
    await validateToken(env, token);
    const original = cleanText(grupo.grupoCuentaOriginal || grupo.grupoCuenta);
    await savePlatformGroup(env, grupo, original);
    return { ok: true, mensaje: "Grupo actualizado correctamente." };
  },

  async eliminarGrupoPlataforma(env, token, plataforma, grupoCuenta) {
    await validateToken(env, token);
    await env.DB.prepare("DELETE FROM platform_details WHERE platform = ? AND group_name = ?")
      .bind(cleanText(plataforma), cleanText(grupoCuenta))
      .run();

    return { ok: true, mensaje: "Grupo eliminado correctamente." };
  },

  async obtenerGruposPlataformas(env, token) {
    await validateToken(env, token);
    const result = await env.DB.prepare(
      "SELECT * FROM platform_details ORDER BY created_at DESC, space ASC"
    ).all();

    const map = new Map();

    for (const row of result.results || []) {
      const info = expirationInfo(row.cut_date);
      const item = {
        id: row.id,
        plataforma: row.platform,
        grupoCuenta: row.group_name,
        tipo: row.detail_type,
        espacio: row.space,
        nombre: row.display_name,
        correo: row.email,
        contrasena: await decryptText(row.password_enc, env.DATA_ENCRYPTION_KEY),
        pin: await decryptText(row.pin_enc, env.DATA_ENCRYPTION_KEY),
        proveedor: row.provider,
        fechaInicio: row.start_date || "",
        fechaCorte: row.cut_date || "",
        observacion: row.notes || "",
        diasRestantes: info.diasRestantes,
        estado: info.estado
      };

      const key = `${item.plataforma}__${item.grupoCuenta}`;
      if (!map.has(key)) {
        map.set(key, {
          plataforma: item.plataforma,
          grupoCuenta: item.grupoCuenta,
          proveedor: item.proveedor,
          correoMadre: "",
          contrasenaMadre: "",
          fechaInicio: item.fechaInicio,
          fechaCorte: item.fechaCorte,
          observacion: item.observacion,
          diasRestantesCuenta: item.diasRestantes,
          estadoCuenta: item.estado,
          espacios: []
        });
      }

      const group = map.get(key);
      if (item.espacio === "MADRE" || item.tipo === "Cuenta familiar") {
        group.correoMadre = item.correo;
        group.contrasenaMadre = item.contrasena;
        group.proveedor = item.proveedor;
        group.fechaInicio = item.fechaInicio;
        group.fechaCorte = item.fechaCorte;
        group.observacion = item.observacion;
        group.diasRestantesCuenta = item.diasRestantes;
        group.estadoCuenta = item.estado;
      } else {
        if (!group.correoMadre) group.correoMadre = item.correo;
        if (!group.contrasenaMadre) group.contrasenaMadre = item.contrasena;
        if (!group.proveedor) group.proveedor = item.proveedor;
        group.espacios.push(item);
      }
    }

    return [...map.values()];
  }
};

async function savePlatformGroup(env, grupo, groupToReplace) {
  const platform = cleanText(grupo.plataforma);
  const groupName = cleanText(grupo.grupoCuenta);
  const provider = cleanText(grupo.proveedor);
  const motherEmail = cleanText(grupo.correoMadre);
  const motherPassword = cleanText(grupo.contrasenaMadre);
  const startDate = optionalISODate(grupo.fechaInicio);
  const cutDate = optionalISODate(grupo.fechaCorte);
  const notes = cleanText(grupo.observacion);

  if (!platform || !groupName) throw new Error("Falta plataforma o nombre del grupo.");
  if (!env.DATA_ENCRYPTION_KEY) {
    throw new Error("Falta configurar el secreto DATA_ENCRYPTION_KEY en Cloudflare.");
  }

  const spaces = Array.isArray(grupo.espacios) ? grupo.espacios.slice(0, 5) : [];
  const statements = [];

  if (groupToReplace) {
    statements.push(
      env.DB.prepare("DELETE FROM platform_details WHERE platform = ? AND group_name = ?")
        .bind(platform, groupToReplace)
    );
  }

  const motherPasswordEnc = await encryptText(motherPassword, env.DATA_ENCRYPTION_KEY);
  statements.push(
    env.DB.prepare(`
      INSERT INTO platform_details (
        id, platform, group_name, detail_type, space, display_name, email,
        password_enc, pin_enc, provider, start_date, cut_date, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      makeId(), platform, groupName,
      platform === "Spotify" ? "Cuenta familiar" : "Cuenta principal",
      "MADRE",
      platform === "Spotify" ? "Cuenta familiar" : "Cuenta principal",
      motherEmail,
      motherPasswordEnc,
      "",
      provider,
      startDate,
      cutDate,
      notes
    )
  );

  for (let index = 0; index < 5; index++) {
    const space = spaces[index] || {};
    const email = platform === "Netflix" ? motherEmail : cleanText(space.correo);
    const password = platform === "Netflix" ? motherPassword : cleanText(space.contrasena);
    const passwordEnc = await encryptText(password, env.DATA_ENCRYPTION_KEY);
    const pinEnc = await encryptText(cleanText(space.pin), env.DATA_ENCRYPTION_KEY);

    statements.push(
      env.DB.prepare(`
        INSERT INTO platform_details (
          id, platform, group_name, detail_type, space, display_name, email,
          password_enc, pin_enc, provider, start_date, cut_date, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        makeId(), platform, groupName,
        platform === "Spotify"
          ? "Cliente Spotify"
          : platform === "Netflix"
            ? "Perfil Netflix"
            : "Cliente / espacio",
        `Espacio ${index + 1}`,
        cleanText(space.nombre),
        email,
        passwordEnc,
        pinEnc,
        provider,
        optionalISODate(space.fechaInicio),
        optionalISODate(space.fechaCorte),
        cleanText(space.observacion)
      )
    );
  }

  await env.DB.batch(statements);
}

function normalizePayment(pago) {
  const paymentDate = toISODate(pago.fechaPago || todayInGuayaquil());
  const startDate = toISODate(pago.fechaInicio || paymentDate);
  const months = Math.max(1, Math.trunc(Number(pago.meses || 1)));
  const amount = parseAmount(pago.montoPagado);
  const customer = cleanText(pago.usuario);
  const platform = cleanText(pago.plataforma);

  if (!customer || !platform) throw new Error("Completa cliente y plataforma.");
  if (amount < 0) throw new Error("El monto no puede ser negativo.");

  return {
    id: cleanText(pago.id) || makeId(),
    paymentDate,
    customer,
    platform,
    serviceType: cleanText(pago.tipo),
    phone: cleanText(pago.telefono),
    months,
    amount,
    startDate,
    cutDate: addDays(startDate, months * DAYS_PER_MONTH),
    notes: cleanText(pago.observacion)
  };
}

function normalizeExpense(gasto) {
  const amount = parseAmount(gasto.monto);
  if (amount < 0) throw new Error("El monto no puede ser negativo.");

  return {
    id: cleanText(gasto.id) || makeId(),
    expenseDate: toISODate(gasto.fecha || todayInGuayaquil()),
    category: cleanText(gasto.categoria),
    platform: cleanText(gasto.plataforma),
    description: cleanText(gasto.descripcion),
    amount
  };
}

async function validateToken(env, token) {
  if (!token) throw new Error("Sesión inválida. Vuelve a iniciar sesión.");
  const tokenHash = await sha256Hex(String(token));
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT username, expires_at FROM sessions WHERE token_hash = ?"
  ).bind(tokenHash).first();

  if (!row || Number(row.expires_at) <= now) {
    if (row) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    }
    throw new Error("Sesión vencida. Vuelve a iniciar sesión.");
  }

  return row.username;
}

function expirationInfo(cutDate) {
  if (!cutDate) return { diasRestantes: "", estado: "SIN_FECHA" };
  const today = todayInGuayaquil();
  const days = differenceInDays(today, String(cutDate));
  if (!Number.isFinite(days)) return { diasRestantes: "", estado: "SIN_FECHA" };

  let estado = "ACTIVO";
  if (days < 0) estado = "VENCIDO";
  else if (days === 0) estado = "VENCE HOY";
  else if (days <= 7) estado = "POR VENCER";

  return { diasRestantes: days < 0 ? 0 : days, estado };
}

function todayInGuayaquil() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toISODate(value) {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return validateISODate(text);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return validateISODate(`${year}-${month}-${day}`);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida.");
  return date.toISOString().slice(0, 10);
}

function optionalISODate(value) {
  return cleanText(value) ? toISODate(value) : null;
}

function validateISODate(text) {
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("Fecha inválida.");
  return text;
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function differenceInDays(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.ceil((to - from) / 86_400_000);
}

function createPaymentMessage(customer, platform, amount, cutDate) {
  return `Hola ${customer}, espero que estés muy bien. Te recordamos que tu servicio de ${platform} llegó a su fecha de corte (${cutDate}). Para mantener activo el acceso, puedes renovar realizando el pago de $${Number(amount || 0)}. Quedo atento a tu confirmación.`;
}

function createWhatsAppLink(phone, message) {
  let number = String(phone || "").replace(/\D/g, "");
  if (!number) return "";
  if (!number.startsWith("593")) number = `593${number.replace(/^0/, "")}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function cleanText(value) {
  return String(value ?? "").trim().slice(0, 5000);
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function makeId() {
  return `ID-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function constantTimeEqual(left, right) {
  const [a, b] = await Promise.all([sha256Bytes(left), sha256Bytes(right)]);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    diff |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return diff === 0;
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return new Uint8Array(digest);
}

async function encryptionKey(secret) {
  if (!secret) throw new Error("Falta DATA_ENCRYPTION_KEY.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(secret)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptText(value, secret) {
  const plain = String(value || "");
  if (!plain) return "";
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

async function decryptText(value, secret) {
  const encoded = String(value || "");
  if (!encoded) return "";
  try {
    const combined = base64ToBytes(encoded);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await encryptionKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
