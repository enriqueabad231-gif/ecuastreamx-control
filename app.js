let TOKEN = localStorage.getItem("CONTROL_TOKEN") || "";
  let USUARIO = localStorage.getItem("CONTROL_USER") || "";
  let GRUPOS_PLATAFORMAS_CACHE = [];

  document.addEventListener("DOMContentLoaded", () => {
    cargarLogo();
    configurarFechas();
    configurarEventos();

    if (TOKEN) {
      mostrarApp();
      cargarDashboard();
    }
  });


  /***************
   * LOGO
   ***************/
  function cargarLogo() {
    google.script.run
      .withSuccessHandler(src => {
        document.querySelectorAll(".app-logo").forEach(img => {
          img.src = src;
        });
      })
      .obtenerLogoBase64();
  }


  /***************
   * EVENTOS
   ***************/
  function configurarEventos() {
    document.getElementById("btnLogin").addEventListener("click", iniciarSesion);
    document.getElementById("btnSalir").addEventListener("click", cerrarSesion);
    document.getElementById("btnActualizar").addEventListener("click", cargarDashboard);

    document.getElementById("loginPass").addEventListener("keydown", e => {
      if (e.key === "Enter") iniciarSesion();
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        cambiarSeccion(btn.dataset.section);
      });
    });

    document.getElementById("formPago").addEventListener("submit", guardarPago);
    document.getElementById("btnCancelarEdicionPago").addEventListener("click", cancelarEdicionPago);

    document.getElementById("formGasto").addEventListener("submit", guardarGasto);
    document.getElementById("btnCancelarEdicionGasto").addEventListener("click", cancelarEdicionGasto);

    document.getElementById("btnAgregarCuenta").addEventListener("click", abrirNuevoGrupoPlataforma);
    document.getElementById("formGrupoPlataforma").addEventListener("submit", guardarGrupoPlataforma);
    document.getElementById("btnCancelarGrupo").addEventListener("click", cerrarEditorGrupo);
  }

  function configurarFechas() {
  const hoy = fechaLocalInput();

  document.getElementById("fechaPago").value = hoy;
  document.getElementById("fechaInicio").value = hoy;
  document.getElementById("fechaGasto").value = hoy;
}

function fechaLocalInput() {
  const hoy = new Date();
  const año = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");

  return `${año}-${mes}-${dia}`;
}


  /***************
   * LOGIN
   ***************/
  function iniciarSesion() {
    const usuario = document.getElementById("loginUser").value.trim();
    const clave = document.getElementById("loginPass").value.trim();
    const msg = document.getElementById("loginMsg");

    if (!usuario || !clave) {
      mostrarMensaje(msg, "Completa usuario y contraseña.", "error");
      return;
    }

    mostrarMensaje(msg, "Verificando acceso...", "");

    google.script.run
      .withSuccessHandler(res => {
        if (!res.ok) {
          mostrarMensaje(msg, res.mensaje || "No se pudo iniciar sesión.", "error");
          return;
        }

        TOKEN = res.token;
        USUARIO = res.usuario;

        localStorage.setItem("CONTROL_TOKEN", TOKEN);
        localStorage.setItem("CONTROL_USER", USUARIO);

        mostrarMensaje(msg, "Acceso correcto.", "ok");
        mostrarApp();
        cargarDashboard();
      })
      .withFailureHandler(error => {
        mostrarMensaje(msg, error.message || "Error al iniciar sesión.", "error");
      })
      .login(usuario, clave);
  }

  function cerrarSesion() {
    TOKEN = "";
    USUARIO = "";

    localStorage.removeItem("CONTROL_TOKEN");
    localStorage.removeItem("CONTROL_USER");

    document.getElementById("appView").classList.add("hidden");
    document.getElementById("loginView").classList.remove("hidden");

    document.getElementById("loginPass").value = "";
  }

  function mostrarApp() {
    document.getElementById("loginView").classList.add("hidden");
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("userLabel").textContent = USUARIO || "Admin";
  }


  /***************
   * SECCIONES
   ***************/
  function cambiarSeccion(id) {
    document.querySelectorAll(".section").forEach(section => {
      section.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.classList.remove("active");
    });

    document.getElementById(id).classList.add("active");
    document.querySelector(`[data-section="${id}"]`).classList.add("active");

    const titulos = {
      dashboard: "Dashboard",
      registroPagos: "Registrar pago",
      registroGastos: "Registrar gasto",
      porVencer: "Por vencer",
      vencidos: "Vencidos",
      ultimos: "Últimos pagos",
      ultimosGastos: "Últimos gastos",
      plataformas: "Plataformas"
    };

    document.getElementById("tituloSeccion").textContent = titulos[id] || "Panel";

    if (id === "plataformas") {
      cargarGruposPlataformas();
    }
  }


  /***************
   * DASHBOARD
   ***************/
  function cargarDashboard() {
    google.script.run
      .withSuccessHandler(renderDashboard)
      .withFailureHandler(manejarError)
      .obtenerDashboard(TOKEN);
  }

  function renderDashboard(data) {
    document.getElementById("mesActual").textContent = data.mesActual;

    document.getElementById("cardIngresos").textContent = money(data.ingresosMes);
    document.getElementById("cardGastos").textContent = money(data.gastosMes);
    document.getElementById("cardNeto").textContent = money(data.netoMes);

    document.getElementById("cardActivos").textContent = data.activos;
    document.getElementById("cardPorVencer").textContent = data.porVencer;
    document.getElementById("cardVencidos").textContent = data.vencidos;

    renderBarrasPlataformas(data.plataformas);
    renderMiniPorVencer(data.listaPorVencer);
    renderTablaPorVencer(data.listaPorVencer);
    renderTablaVencidos(data.listaVencidos);
    renderUltimosPagos(data.ultimosPagos);
    renderUltimosGastos(data.ultimosGastos);
  }

  function renderBarrasPlataformas(plataformas) {
    const contenedor = document.getElementById("platformBars");
    const valores = Object.values(plataformas);
    const max = Math.max(...valores, 1);

    contenedor.innerHTML = Object.entries(plataformas).map(([nombre, valor]) => {
      const porcentaje = Math.round((valor / max) * 100);

      return `
        <div class="bar-row">
          <div class="bar-name">${esc(nombre)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${porcentaje}%"></div>
          </div>
          <div class="bar-value">${money(valor)}</div>
        </div>
      `;
    }).join("");
  }

  function renderMiniPorVencer(lista) {
    const tbody = document.getElementById("miniPorVencer");
    const items = lista.slice(0, 5);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty">No hay clientes por vencer.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${esc(item.usuario)}</td>
        <td>${esc(item.plataforma)}</td>
        <td>
          <span class="badge warning">${item.diasRestantes} días</span>
        </td>
        <td>${botonWhatsApp(item.whatsapp)}</td>
      </tr>
    `).join("");
  }


  /***************
   * PAGOS
   ***************/
  function guardarPago(e) {
    e.preventDefault();

    const msg = document.getElementById("msgPago");
    const editId = document.getElementById("editPagoId").value;

    const pago = {
      id: editId,
      fechaPago: document.getElementById("fechaPago").value,
      usuario: document.getElementById("usuario").value,
      plataforma: document.getElementById("plataforma").value,
      tipo: document.getElementById("tipo").value,
      telefono: document.getElementById("telefono").value,
      meses: document.getElementById("meses").value,
      montoPagado: document.getElementById("montoPagado").value,
      fechaInicio: document.getElementById("fechaInicio").value,
      observacion: document.getElementById("observacion").value
    };

    if (!pago.usuario || !pago.plataforma || !pago.telefono || !pago.montoPagado) {
      mostrarMensaje(msg, "Completa cliente, plataforma, teléfono y monto.", "error");
      return;
    }

    mostrarMensaje(msg, editId ? "Actualizando pago..." : "Guardando pago...", "");

    const runner = google.script.run
      .withSuccessHandler(res => {
        mostrarMensaje(msg, res.mensaje, res.ok ? "ok" : "error");

        if (res.ok) {
          document.getElementById("formPago").reset();
          cancelarEdicionPago();
          configurarFechas();
          cargarDashboard();
        }
      })
      .withFailureHandler(error => {
        mostrarMensaje(msg, error.message || "Error al guardar pago.", "error");
      });

    if (editId) {
      runner.actualizarPago(TOKEN, pago);
    } else {
      runner.registrarPago(TOKEN, pago);
    }
  }

  function editarPago(idPago) {
    google.script.run
      .withSuccessHandler(res => {
        if (!res.ok) {
          alert(res.mensaje || "No se pudo cargar el pago.");
          return;
        }

        const p = res.pago;

        document.getElementById("editPagoId").value = p.id;
        document.getElementById("fechaPago").value = p.fechaPago;
        document.getElementById("usuario").value = p.usuario;
        document.getElementById("plataforma").value = p.plataforma;
        document.getElementById("tipo").value = p.tipo;
        document.getElementById("telefono").value = p.telefono;
        document.getElementById("meses").value = p.meses;
        document.getElementById("montoPagado").value = p.montoPagado;
        document.getElementById("fechaInicio").value = p.fechaInicio;
        document.getElementById("observacion").value = p.observacion;

        document.getElementById("btnGuardarPago").textContent = "Actualizar pago";
        document.getElementById("btnCancelarEdicionPago").classList.remove("hidden");

        cambiarSeccion("registroPagos");
      })
      .withFailureHandler(manejarError)
      .obtenerPagoPorId(TOKEN, idPago);
  }

  function cancelarEdicionPago() {
    document.getElementById("editPagoId").value = "";
    document.getElementById("btnGuardarPago").textContent = "Guardar pago";
    document.getElementById("btnCancelarEdicionPago").classList.add("hidden");
  }

  function borrarPago(idPago) {
    const confirmar = confirm("¿Seguro que quieres eliminar este pago? Esta acción no se puede deshacer.");

    if (!confirmar) return;

    google.script.run
      .withSuccessHandler(res => {
        alert(res.mensaje);

        if (res.ok) {
          cargarDashboard();
        }
      })
      .withFailureHandler(manejarError)
      .eliminarPago(TOKEN, idPago);
  }


  /***************
   * GASTOS
   ***************/
  function guardarGasto(e) {
    e.preventDefault();

    const msg = document.getElementById("msgGasto");
    const editId = document.getElementById("editGastoId").value;

    const gasto = {
      id: editId,
      fecha: document.getElementById("fechaGasto").value,
      categoria: document.getElementById("categoriaGasto").value,
      plataforma: document.getElementById("plataformaGasto").value,
      descripcion: document.getElementById("descripcionGasto").value,
      monto: document.getElementById("montoGasto").value
    };

    if (!gasto.monto) {
      mostrarMensaje(msg, "Ingresa el monto del gasto.", "error");
      return;
    }

    mostrarMensaje(msg, editId ? "Actualizando gasto..." : "Guardando gasto...", "");

    const runner = google.script.run
      .withSuccessHandler(res => {
        mostrarMensaje(msg, res.mensaje, res.ok ? "ok" : "error");

        if (res.ok) {
          document.getElementById("formGasto").reset();
          cancelarEdicionGasto();
          configurarFechas();
          cargarDashboard();
        }
      })
      .withFailureHandler(error => {
        mostrarMensaje(msg, error.message || "Error al guardar gasto.", "error");
      });

    if (editId) {
      runner.actualizarGasto(TOKEN, gasto);
    } else {
      runner.registrarGasto(TOKEN, gasto);
    }
  }

  function editarGasto(idGasto) {
    google.script.run
      .withSuccessHandler(res => {
        if (!res.ok) {
          alert(res.mensaje || "No se pudo cargar el gasto.");
          return;
        }

        const g = res.gasto;

        document.getElementById("editGastoId").value = g.id;
        document.getElementById("fechaGasto").value = g.fecha;
        document.getElementById("categoriaGasto").value = g.categoria;
        document.getElementById("plataformaGasto").value = g.plataforma;
        document.getElementById("descripcionGasto").value = g.descripcion;
        document.getElementById("montoGasto").value = g.monto;

        document.getElementById("btnGuardarGasto").textContent = "Actualizar gasto";
        document.getElementById("btnCancelarEdicionGasto").classList.remove("hidden");

        cambiarSeccion("registroGastos");
      })
      .withFailureHandler(manejarError)
      .obtenerGastoPorId(TOKEN, idGasto);
  }

  function cancelarEdicionGasto() {
    document.getElementById("editGastoId").value = "";
    document.getElementById("btnGuardarGasto").textContent = "Guardar gasto";
    document.getElementById("btnCancelarEdicionGasto").classList.add("hidden");
  }

  function borrarGasto(idGasto) {
    const confirmar = confirm("¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.");

    if (!confirmar) return;

    google.script.run
      .withSuccessHandler(res => {
        alert(res.mensaje);

        if (res.ok) {
          cargarDashboard();
        }
      })
      .withFailureHandler(manejarError)
      .eliminarGasto(TOKEN, idGasto);
  }


  /***************
   * TABLAS
   ***************/
  function renderTablaPorVencer(lista) {
  const tbody = document.getElementById("tablaPorVencer");

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty">No tienes clientes por vencer.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map(item => `
    <tr>
      <td>${esc(item.usuario)}</td>
      <td>${esc(item.plataforma)}</td>
      <td>${esc(item.tipo)}</td>
      <td>${esc(item.telefono || "—")}</td>
      <td>${esc(item.fechaCorte)}</td>
      <td><span class="badge warning">${item.diasRestantes} días</span></td>
      <td>${item.monto ? money(item.monto) : "—"}</td>
      <td>${item.whatsapp ? botonWhatsApp(item.whatsapp) : '<span class="empty">—</span>'}</td>
    </tr>
  `).join("");
}

 function renderTablaVencidos(lista) {
  const tbody = document.getElementById("tablaVencidos");

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty">No tienes clientes vencidos.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map(item => `
    <tr>
      <td>${esc(item.usuario)}</td>
      <td>${esc(item.plataforma)}</td>
      <td>${esc(item.tipo)}</td>
      <td>${esc(item.telefono || "—")}</td>
      <td>${esc(item.fechaCorte)}</td>
      <td><span class="badge danger">${item.diasRestantes} días</span></td>
      <td>${badgeEstado(item.estado)}</td>
      <td>${item.monto ? money(item.monto) : "—"}</td>
      <td>${item.whatsapp ? botonWhatsApp(item.whatsapp) : '<span class="empty">—</span>'}</td>
    </tr>
  `).join("");
}

  function renderUltimosPagos(lista) {
    const tbody = document.getElementById("tablaUltimos");

    if (lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty">Aún no hay pagos registrados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = lista.map(item => `
      <tr>
        <td>${esc(item.fechaPago)}</td>
        <td>${esc(item.usuario)}</td>
        <td>${esc(item.plataforma)}</td>
        <td>${esc(item.tipo)}</td>
        <td>${item.meses}</td>
        <td>${esc(item.fechaCorte)}</td>
        <td>${badgeDias(item)}</td>
        <td>${money(item.monto)}</td>
        <td>
          <div class="actions">
            <button class="btn-mini btn-edit" onclick="editarPago('${esc(item.id)}')">Editar</button>
            <button class="btn-mini btn-delete" onclick="borrarPago('${esc(item.id)}')">Borrar</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function renderUltimosGastos(lista) {
    const tbody = document.getElementById("tablaUltimosGastos");

    if (!tbody) return;

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty">Aún no hay gastos registrados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = lista.map(item => `
      <tr>
        <td>${esc(item.fecha)}</td>
        <td>${esc(item.categoria)}</td>
        <td>${esc(item.plataforma)}</td>
        <td>${esc(item.descripcion)}</td>
        <td>${money(item.monto)}</td>
        <td>
          <div class="actions">
            <button class="btn-mini btn-edit" onclick="editarGasto('${esc(item.id)}')">Editar</button>
            <button class="btn-mini btn-delete" onclick="borrarGasto('${esc(item.id)}')">Borrar</button>
          </div>
        </td>
      </tr>
    `).join("");
  }


  /***************
   * PLATAFORMAS POR GRUPOS
   ***************/
  function abrirNuevoGrupoPlataforma() {
    const plataforma = document.getElementById("selectNuevaPlataforma").value;

    document.getElementById("editorGrupo").classList.remove("hidden");
    document.getElementById("formGrupoPlataforma").reset();

    document.getElementById("editandoGrupo").value = "";
    document.getElementById("grupoPlataforma").value = plataforma;
    document.getElementById("grupoCuentaOriginal").value = "";
    document.getElementById("tituloEditorGrupo").textContent = `Nuevo grupo de ${plataforma}`;

    google.script.run
      .withSuccessHandler(nombreGrupo => {
        document.getElementById("grupoCuenta").value = nombreGrupo;
      })
      .withFailureHandler(manejarError)
      .obtenerSiguienteGrupoPlataforma(TOKEN, plataforma);

    construirEspaciosGrupo(plataforma, []);
  }

  function construirEspaciosGrupo(plataforma, espacios) {
    const contenedor = document.getElementById("contenedorEspacios");
    const ayuda = document.getElementById("ayudaEspacios");

    const total = 5;

    if (plataforma === "Spotify") {
      ayuda.textContent = "Spotify: cuenta familiar arriba + 5 espacios de clientes.";
    } else if (plataforma === "Netflix") {
      ayuda.textContent = "Netflix: el correo y contraseña principal se repiten para los 5 espacios.";
    } else {
      ayuda.textContent = "Cada grupo tendrá 5 espacios para organizar clientes o perfiles.";
    }

    let html = "";

    for (let i = 0; i < total; i++) {
      const item = espacios[i] || {};

      html += `
        <div class="space-card" data-space-index="${i}">
          <div class="space-card-header">
            <h4>Espacio ${i + 1}</h4>
            <span>${plataforma === "Spotify" ? "Cliente del grupo familiar" : "Perfil / espacio de la cuenta"}</span>
          </div>

          <div class="space-fields">
            <div class="input-group">
              <label>Nombre</label>
              <input type="text" class="space-nombre" value="${esc(item.nombre || "")}" placeholder="Nombre del cliente">
            </div>

            <div class="input-group">
              <label>${plataforma === "Netflix" ? "Correo cliente opcional" : "Correo cliente"}</label>
              <input type="text" class="space-correo" value="${esc(item.correo || "")}" placeholder="Correo del cliente">
            </div>

            <div class="input-group">
              <label>${plataforma === "Netflix" ? "Contraseña opcional" : "Contraseña cliente"}</label>
              <input type="text" class="space-contrasena" value="${esc(item.contrasena || "")}" placeholder="Contraseña">
            </div>

            <div class="input-group">
              <label>PIN</label>
              <input type="text" class="space-pin" value="${esc(item.pin || "")}" placeholder="PIN">
            </div>

            <div class="input-group">
              <label>Inicio</label>
              <input type="date" class="space-inicio" value="${esc(item.fechaInicio || "")}">
            </div>

            <div class="input-group">
              <label>Corte</label>
              <input type="date" class="space-corte" value="${esc(item.fechaCorte || "")}">
            </div>

            <div class="input-group">
              <label>Observación</label>
              <input type="text" class="space-observacion" value="${esc(item.observacion || "")}" placeholder="Detalle">
            </div>
          </div>
        </div>
      `;
    }

    contenedor.innerHTML = html;
  }

  function guardarGrupoPlataforma(e) {
    e.preventDefault();

    const msg = document.getElementById("msgGrupoPlataforma");

    const plataforma = document.getElementById("grupoPlataforma").value;
    const editando = document.getElementById("editandoGrupo").value;

    const grupo = {
      plataforma,
      grupoCuenta: document.getElementById("grupoCuenta").value,
      grupoCuentaOriginal: document.getElementById("grupoCuentaOriginal").value,
      correoMadre: document.getElementById("correoMadre").value,
      contrasenaMadre: document.getElementById("contrasenaMadre").value,
      proveedor: document.getElementById("proveedorGrupo").value,
      fechaInicio: document.getElementById("fechaInicioGrupo").value,
      fechaCorte: document.getElementById("fechaCorteGrupo").value,
      observacion: document.getElementById("observacionGrupo").value,
      espacios: []
    };

    if (!grupo.grupoCuenta) {
      mostrarMensaje(msg, "Ponle nombre al grupo.", "error");
      return;
    }

    document.querySelectorAll(".space-card").forEach(card => {
      grupo.espacios.push({
        nombre: card.querySelector(".space-nombre").value,
        correo: card.querySelector(".space-correo").value,
        contrasena: card.querySelector(".space-contrasena").value,
        pin: card.querySelector(".space-pin").value,
        fechaInicio: card.querySelector(".space-inicio").value,
        fechaCorte: card.querySelector(".space-corte").value,
        observacion: card.querySelector(".space-observacion").value
      });
    });

    mostrarMensaje(msg, editando ? "Actualizando grupo..." : "Guardando grupo...", "");

    const runner = google.script.run
      .withSuccessHandler(res => {
        mostrarMensaje(msg, res.mensaje, res.ok ? "ok" : "error");

        if (res.ok) {
          cerrarEditorGrupo();
          cargarGruposPlataformas();
        }
      })
      .withFailureHandler(error => {
        mostrarMensaje(msg, error.message || "Error al guardar grupo.", "error");
      });

    if (editando) {
      runner.actualizarGrupoPlataforma(TOKEN, grupo);
    } else {
      runner.guardarGrupoPlataforma(TOKEN, grupo);
    }
  }

  function cerrarEditorGrupo() {
  document.getElementById("editorGrupo").classList.add("hidden");
  document.getElementById("formGrupoPlataforma").reset();
  document.getElementById("editandoGrupo").value = "";
  document.getElementById("grupoPlataforma").value = "";
  document.getElementById("grupoCuentaOriginal").value = "";
  document.getElementById("contenedorEspacios").innerHTML = "";
  document.getElementById("msgGrupoPlataforma").textContent = "";
}

  function cargarGruposPlataformas() {
    google.script.run
      .withSuccessHandler(renderGruposPlataformas)
      .withFailureHandler(manejarError)
      .obtenerGruposPlataformas(TOKEN);
  }

  function renderGruposPlataformas(lista) {
  GRUPOS_PLATAFORMAS_CACHE = lista || [];

  const contenedor = document.getElementById("listaGruposPlataformas");

  if (!lista || lista.length === 0) {
    contenedor.innerHTML = `<div class="empty">Aún no hay grupos registrados. Presiona “Agregar cuenta”.</div>`;
    return;
  }

  contenedor.innerHTML = lista.map((grupo, index) => {
    const espaciosOrdenados = [...grupo.espacios].sort((a, b) => {
      const na = Number(String(a.espacio).replace(/\D/g, "")) || 0;
      const nb = Number(String(b.espacio).replace(/\D/g, "")) || 0;
      return na - nb;
    });

    return `
      <div class="group-card">
        <div class="group-card-header">
          <div>
            <h3>${esc(grupo.grupoCuenta)}</h3>
            <div class="group-meta">
              ${esc(grupo.plataforma)} · ${espaciosOrdenados.length} espacios registrados
            </div>
          </div>

          <div class="group-actions">
            <button class="btn-mini btn-edit" onclick="editarGrupoPlataforma(${index})">Editar grupo</button>
            <button class="btn-mini btn-delete" onclick="borrarGrupoPlataforma(${index})">Borrar grupo</button>
          </div>
        </div>

        <div class="group-master">
          <div class="master-item">
            <small>Correo madre / cuenta</small>
            <b>${esc(grupo.correoMadre)}</b>
          </div>

          <div class="master-item">
            <small>Contraseña</small>
            <b class="password-cell">${esc(grupo.contrasenaMadre)}</b>
          </div>

          <div class="master-item">
            <small>Proveedor</small>
            <b>${esc(grupo.proveedor)}</b>
          </div>

          <div class="master-item">
            <small>Inicio cuenta</small>
            <b>${esc(grupo.fechaInicio)}</b>
          </div>

          <div class="master-item">
            <small>Corte cuenta</small>
            <b>${esc(grupo.fechaCorte)}</b>
          </div>

          <div class="master-item">
            <small>Contador</small>
            <b>${contadorDias(grupo.diasRestantesCuenta, grupo.estadoCuenta)}</b>
          </div>
        </div>

        <div class="group-spaces">
          <div class="group-space-row header">
            <div>Espacio</div>
            <div>Nombre</div>
            <div>Correo</div>
            <div>Contraseña</div>
            <div>PIN</div>
            <div>Inicio</div>
            <div>Corte</div>
            <div>Contador</div>
          </div>

          ${renderEspaciosGrupo(grupo, espaciosOrdenados)}
        </div>
      </div>
    `;
  }).join("");
}

  function renderEspaciosGrupo(grupo, espacios) {
  const total = 5;
  let html = "";

  for (let i = 0; i < total; i++) {
    const item = espacios[i] || {};

    html += `
      <div class="group-space-row">
        <div><b>Espacio ${i + 1}</b></div>
        <div>${esc(item.nombre || "")}</div>
        <div>${esc(item.correo || grupo.correoMadre || "")}</div>
        <div class="password-cell">${esc(item.contrasena || grupo.contrasenaMadre || "")}</div>
        <div>${esc(item.pin || "")}</div>
        <div>${esc(item.fechaInicio || grupo.fechaInicio || "")}</div>
        <div>${esc(item.fechaCorte || grupo.fechaCorte || "")}</div>
        <div>${contadorDias(
          item.diasRestantes !== undefined ? item.diasRestantes : grupo.diasRestantesCuenta,
          item.estado || grupo.estadoCuenta
        )}</div>
      </div>
    `;
  }

  return html;
}

  function editarGrupoPlataforma(index) {
    const grupo = GRUPOS_PLATAFORMAS_CACHE[index];

    if (!grupo) return;

    document.getElementById("editorGrupo").classList.remove("hidden");

    document.getElementById("editandoGrupo").value = "SI";
    document.getElementById("grupoPlataforma").value = grupo.plataforma;

    document.getElementById("tituloEditorGrupo").textContent = `Editando ${grupo.grupoCuenta}`;

    document.getElementById("grupoCuenta").value = grupo.grupoCuenta;
    document.getElementById("grupoCuentaOriginal").value = grupo.grupoCuenta;
    document.getElementById("correoMadre").value = grupo.correoMadre || "";
    document.getElementById("contrasenaMadre").value = grupo.contrasenaMadre || "";
    document.getElementById("proveedorGrupo").value = grupo.proveedor || "";
    document.getElementById("fechaInicioGrupo").value = grupo.fechaInicio || "";
    document.getElementById("fechaCorteGrupo").value = grupo.fechaCorte || "";
    document.getElementById("observacionGrupo").value = grupo.observacion || "";

    const espaciosOrdenados = [...grupo.espacios].sort((a, b) => {
      const na = Number(String(a.espacio).replace(/\D/g, "")) || 0;
      const nb = Number(String(b.espacio).replace(/\D/g, "")) || 0;
      return na - nb;
    });

    construirEspaciosGrupo(grupo.plataforma, espaciosOrdenados);

    document.getElementById("editorGrupo").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function borrarGrupoPlataforma(index) {
    const grupo = GRUPOS_PLATAFORMAS_CACHE[index];

    if (!grupo) return;

    const confirmar = confirm(`¿Seguro que quieres borrar ${grupo.grupoCuenta}? Se eliminarán todos sus espacios.`);

    if (!confirmar) return;

    google.script.run
      .withSuccessHandler(res => {
        alert(res.mensaje);

        if (res.ok) {
          cargarGruposPlataformas();
        }
      })
      .withFailureHandler(manejarError)
      .eliminarGrupoPlataforma(TOKEN, grupo.plataforma, grupo.grupoCuenta);
  }


  /***************
   * UI HELPERS
   ***************/
  function botonWhatsApp(link) {
    if (!link) return `<span class="empty">Sin teléfono</span>`;

    return `
      <a class="wa-link" href="${esc(link)}" target="_blank">
        Cobrar
      </a>
    `;
  }

  function badgeDias(item) {
    if (item.estado === "VENCIDO" || item.estado === "VENCE HOY" || item.diasRestantes === 0) {
      return `<span class="badge danger">${item.diasRestantes} días</span>`;
    }

    if (item.estado === "POR VENCER") {
      return `<span class="badge warning">${item.diasRestantes} días</span>`;
    }

    return `<span class="badge active">${item.diasRestantes} días</span>`;
  }

  function badgeEstado(estado) {
    if (estado === "VENCIDO" || estado === "VENCE HOY") {
      return `<span class="badge danger">${esc(estado)}</span>`;
    }

    if (estado === "POR VENCER") {
      return `<span class="badge warning">${esc(estado)}</span>`;
    }

    return `<span class="badge active">${esc(estado)}</span>`;
  }

function contadorDias(dias, estado) {
  if (dias === "" || dias === null || dias === undefined) {
    return `<span class="badge active">Sin fecha</span>`;
  }

  if (estado === "VENCIDO" || estado === "VENCE HOY" || Number(dias) === 0) {
    return `<span class="badge danger">0 días</span>`;
  }

  if (estado === "POR VENCER") {
    return `<span class="badge warning">${dias} días</span>`;
  }

  return `<span class="badge active">${dias} días</span>`;
}

  function money(valor) {
    const num = Number(valor || 0);
    return "$" + num.toFixed(2);
  }

  function esc(texto) {
    return String(texto ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function mostrarMensaje(elemento, texto, tipo) {
    elemento.textContent = texto || "";
    elemento.className = "msg";

    if (tipo) {
      elemento.classList.add(tipo);
    }
  }

  function manejarError(error) {
    const mensaje = error.message || "Ocurrió un error.";

    if (
      mensaje.includes("Sesión inválida") ||
      mensaje.includes("Sesión vencida")
    ) {
      cerrarSesion();
      const msg = document.getElementById("loginMsg");
      mostrarMensaje(msg, mensaje, "error");
      return;
    }

    alert(mensaje);
  }