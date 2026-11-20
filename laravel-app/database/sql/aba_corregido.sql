-- Script SQL corregido para MariaDB 10.4.32 / MySQL 8+ (Base de datos `a.b.a.`)
-- Corrige los procedimientos almacenados defectuosos del dump original y provee hashes bcrypt reales.

CREATE DATABASE IF NOT EXISTS `a.b.a.` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `a.b.a.`;

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- Nota: Importe primero las tablas y datos de `vers.txt` o ejecute este bloque de actualización
-- para corregir los procedimientos almacenados inconsistentes y los hashes de prueba.

DROP PROCEDURE IF EXISTS `insertar_admin`;
DROP PROCEDURE IF EXISTS `insert_puntaje`;
DROP PROCEDURE IF EXISTS `insert_respeusta_correcta`;
DROP PROCEDURE IF EXISTS `insert_respuesta_correcta`;
DROP PROCEDURE IF EXISTS `insert_respuestas`;
DROP PROCEDURE IF EXISTS `insert_rol`;
DROP PROCEDURE IF EXISTS `insert_usuario`;

DELIMITER $$

-- 1. Corregido: `C_nivel_acceso` -> `c_nivel_acceso` consistente y lista explícita de columnas
CREATE PROCEDURE `insertar_admin` (
  IN `c_id_administrador` INT(11),
  IN `c_id_usuario` INT(11),
  IN `c_nivel_acceso` VARCHAR(50)
)
BEGIN
  INSERT INTO `administrador` (`id_administrador`, `id_usuario`, `nivel_acceso`)
  VALUES (`c_id_administrador`, `c_id_usuario`, `c_nivel_acceso`);
END$$

-- 2. Corregido: parámetros coinciden con columnas reales (`id_puntaje`, `id_estudiante`, `id_evaluacion`, `calificacion`, `fecha_realizacion`)
CREATE PROCEDURE `insert_puntaje` (
  IN `c_id_puntaje` INT(11),
  IN `c_id_estudiante` INT(11),
  IN `c_id_evaluacion` INT(11),
  IN `c_calificacion` DECIMAL(5,2),
  IN `c_fecha_realizacion` TIMESTAMP
)
BEGIN
  INSERT INTO `puntaje` (`id_puntaje`, `id_estudiante`, `id_evaluacion`, `calificacion`, `fecha_realizacion`)
  VALUES (`c_id_puntaje`, `c_id_estudiante`, `c_id_evaluacion`, `c_calificacion`, COALESCE(`c_fecha_realizacion`, CURRENT_TIMESTAMP));
END$$

-- 3. Corregido: nombre de procedimiento `insert_respuesta_correcta` sin errata
CREATE PROCEDURE `insert_respuesta_correcta` (
  IN `c_id_respuesta_correcta` INT(11),
  IN `c_id_respuesta` INT(11),
  IN `c_opcion_correcta` ENUM('A','B','C'),
  IN `c_explicacion` TEXT
)
BEGIN
  INSERT INTO `respuesta_correcta` (`id_respuesta_correcta`, `id_respuesta`, `opcion_correcta`, `explicacion`)
  VALUES (`c_id_respuesta_correcta`, `c_id_respuesta`, `c_opcion_correcta`, `c_explicacion`);
END$$

-- 4. Corregido: `c_evaluacion` -> `c_id_evaluacion` (coincide con parámetro declarado)
CREATE PROCEDURE `insert_respuestas` (
  IN `c_id_respuesta` INT(11),
  IN `c_enunciado_pregunta` TEXT,
  IN `c_opcion_a` VARCHAR(255),
  IN `c_opcion_b` VARCHAR(255),
  IN `c_opcion_c` VARCHAR(255),
  IN `c_id_evaluacion` INT(11)
)
BEGIN
  INSERT INTO `respuestas` (`id_respuesta`, `enunciado_pregunta`, `opcion_a`, `opcion_b`, `opcion_c`, `id_evaluacion`)
  VALUES (`c_id_respuesta`, `c_enunciado_pregunta`, `c_opcion_a`, `c_opcion_b`, `c_opcion_c`, `c_id_evaluacion`);
END$$

-- 5. Corregido: casing consistente `c_nombre_rol`
CREATE PROCEDURE `insert_rol` (
  IN `c_id_rol` INT(11),
  IN `c_nombre_rol` VARCHAR(50)
)
BEGIN
  INSERT INTO `rol` (`id_rol`, `nombre_rol`)
  VALUES (`c_id_rol`, `c_nombre_rol`);
END$$

-- 6. Corregido: se declara el parámetro faltante `IN c_id_rol INT(11)`
CREATE PROCEDURE `insert_usuario` (
  IN `c_id_usuario` INT(11),
  IN `c_nombre` VARCHAR(100),
  IN `c_apellido` VARCHAR(100),
  IN `c_email` VARCHAR(150),
  IN `c_password_hash` VARCHAR(255),
  IN `c_id_rol` INT(11)
)
BEGIN
  INSERT INTO `usuario` (`id_usuario`, `nombre`, `apellido`, `email`, `password_hash`, `id_rol`)
  VALUES (`c_id_usuario`, `c_nombre`, `c_apellido`, `c_email`, `c_password_hash`, `c_id_rol`);
  SELECT * FROM `usuario` WHERE `id_usuario` = `c_id_usuario`;
END$$

DELIMITER ;

-- Actualización recomendada de hashes de demostración (contraseña: `aba2026`)
-- para que `Hash::check` / `password_verify` funcione en Laravel con los usuarios del dump:
-- UPDATE `usuario` SET `password_hash` = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
