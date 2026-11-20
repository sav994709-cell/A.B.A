# Plataforma Educativa A.B.A. — Entregable Laravel 11 + MariaDB

## 1. Requisitos e Instalación Rápida

1. **Crear proyecto base Laravel 11** (si copias estos archivos sobre un proyecto nuevo) e instalar dependencias:
   ```bash
   composer install
   cp .env.example .env
   php artisan key:generate
   ```

2. **Configurar la conexión a MariaDB/MySQL en `.env`:**
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE="a.b.a."
   DB_USERNAME=root
   DB_PASSWORD=
   ```

3. **Importar el dump SQL y el script de corrección:**
   ```bash
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS \`a.b.a.\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
   mysql -u root -p "a.b.a." < vers.txt
   mysql -u root -p "a.b.a." < database/sql/aba_corregido.sql
   ```
   *(También puedes importarlo directamente desde phpMyAdmin seleccionando la base de datos `a.b.a.`).*

4. **Registrar el middleware de roles (`bootstrap/app.php` en Laravel 11):**
   ```php
   ->withMiddleware(function (Middleware $middleware) {
       $middleware->alias([
           'role' => \App\Http\Middleware\CheckRole::class,
       ]);
   })
   ```

5. **Ejecutar el servidor local:**
   ```bash
   php artisan serve
   ```

---

## 2. Decisiones Técnicas frente a las Inconsistencias del Dump SQL (`vers.txt`)

Al auditar `vers.txt`, se detectaron las siguientes inconsistencias en los procedimientos almacenados y datos iniciales:

1. **`insert_puntaje` con columnas y variables inexistentes:**
   - *Problema original:* Declaraba `(c_id_puntaje, c_id_estudiante, c_id_evaluacion, c_calificacion, fecha_realizacion)` pero intentaba insertar `(c_id_estudiante, c_id_usuario, c_id_grado, c_calificacion, c_fecha_realizacion)`.
   - *Solución aplicada:* En Laravel se reemplazó por inserción transaccional vía Eloquent (`Puntaje::create([...])` dentro de `EvaluacionController::responder`), y en `database/sql/aba_corregido.sql` se corrigió el procedimiento para insertar exactamente en las 5 columnas reales de `puntaje`.

2. **`insert_usuario` usaba `c_id_rol` sin declararlo:**
   - *Problema original:* Recibía 5 parámetros pero insertaba 6 valores incluyendo `c_id_rol`.
   - *Solución aplicada:* Se añadió `IN c_id_rol INT(11)` en el SQL corregido y en Laravel se utiliza `Usuario::create([...])` con `Hash::make()` dentro de `DB::transaction()`.

3. **`insert_respuestas` referenciaba `c_evaluacion` en lugar de `c_id_evaluacion`:**
   - *Solución aplicada:* Corregido el identificador en `aba_corregido.sql` y gestionado con `Respuesta::create()` en Laravel.

4. **`insertar_admin` y `insert_rol` con inconsistencias de mayúsculas (`C_nivel_acceso`, `c_nombre_roL`) y errata en `insert_respeusta_correcta`:**
   - *Solución aplicada:* Estandarizados en `aba_corregido.sql` y sustituidos por Eloquent ORM parametrizado en Laravel.

5. **Hashes de demostración en `usuario.password_hash`:**
   - *Problema original:* Los valores `$2y$10$hash_admin_aaron` del dump tienen formato abreviado y no pasan `password_verify()` / `Hash::check()`.
   - *Solución aplicada:* El entorno de pruebas en vivo siembra hashes bcrypt completos de 60 caracteres para la contraseña `aba2026`, manteniendo el algoritmo `$2y$10$` compatible con PHP y Laravel.
