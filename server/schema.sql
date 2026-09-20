-- MySQL dump 10.13  Distrib 8.0.44, for macos11.7 (x86_64)
--
-- Host: 127.0.0.1    Database: scroll_tracker
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `checkins`
--

DROP TABLE IF EXISTS `checkins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checkins` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `kind` enum('morning','daytime','evening') NOT NULL,
  `client_ts` datetime(3) NOT NULL,
  `tz_offset_min` smallint NOT NULL,
  `mood` tinyint NOT NULL,
  `anxiety` tinyint NOT NULL,
  `energy` tinyint NOT NULL,
  `sleep_quality` tinyint DEFAULT NULL,
  `sleep_onset_difficulty` tinyint DEFAULT NULL,
  `received_ts` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source` enum('shortcut','manual','journal') NOT NULL DEFAULT 'shortcut',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_checkin` (`kind`,`client_ts`),
  CONSTRAINT `checkins_chk_1` CHECK ((`mood` between 1 and 10)),
  CONSTRAINT `checkins_chk_2` CHECK ((`anxiety` between 1 and 10)),
  CONSTRAINT `checkins_chk_3` CHECK ((`energy` between 1 and 10)),
  CONSTRAINT `checkins_chk_4` CHECK ((`sleep_quality` between 1 and 10)),
  CONSTRAINT `checkins_chk_5` CHECK ((`sleep_onset_difficulty` between 1 and 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type` enum('open','close','sleep_on','sleep_off') NOT NULL,
  `app` enum('instagram','tiktok','none') NOT NULL DEFAULT 'none',
  `client_ts` datetime(3) NOT NULL,
  `tz_offset_min` smallint NOT NULL,
  `received_ts` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source` enum('shortcut','journal') NOT NULL DEFAULT 'shortcut',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_event` (`type`,`app`,`client_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-20 15:04:42
