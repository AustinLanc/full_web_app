-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: example_grease_data
-- ------------------------------------------------------
-- Server version	9.2.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `names`
--

DROP TABLE IF EXISTS `names`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `names` (
  `code` int NOT NULL,
  `name` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `names`
--

LOCK TABLES `names` WRITE;
/*!40000 ALTER TABLE `names` DISABLE KEYS */;
/*!40000 ALTER TABLE `names` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qc`
--

DROP TABLE IF EXISTS `qc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qc` (
  `batch` varchar(45) NOT NULL,
  `code` varchar(45) DEFAULT NULL,
  `suffix` varchar(45) DEFAULT NULL,
  `pen_60x` varchar(45) DEFAULT NULL,
  `drop_point` varchar(45) DEFAULT NULL,
  `date` varchar(45) DEFAULT NULL,
  `released_by` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`batch`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qc`
--

LOCK TABLES `qc` WRITE;
/*!40000 ALTER TABLE `qc` DISABLE KEYS */;
/*!40000 ALTER TABLE `qc` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `retains`
--

DROP TABLE IF EXISTS `retains`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `retains` (
  `code` int NOT NULL,
  `batch` varchar(255) NOT NULL,
  `date` date NOT NULL DEFAULT (curdate()),
  `box` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `retains`
--

LOCK TABLES `retains` WRITE;
/*!40000 ALTER TABLE `retains` DISABLE KEYS */;
/*!40000 ALTER TABLE `retains` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `testing_data`
--

DROP TABLE IF EXISTS `testing_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `testing_data` (
  `batch` varchar(45) DEFAULT NULL,
  `code` varchar(45) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `pen_0x` varchar(45) DEFAULT NULL,
  `pen_60x` varchar(45) DEFAULT NULL,
  `pen_10k` varchar(45) DEFAULT NULL,
  `pen_100k` varchar(45) DEFAULT NULL,
  `drop_point` varchar(45) DEFAULT NULL,
  `weld` varchar(45) DEFAULT NULL,
  `timken` varchar(45) DEFAULT NULL,
  `rust` varchar(45) DEFAULT NULL,
  `copper_corrosion` varchar(45) DEFAULT NULL,
  `oxidation` varchar(45) DEFAULT NULL,
  `oil_bleed` varchar(45) DEFAULT NULL,
  `spray_off` varchar(45) DEFAULT NULL,
  `washout` varchar(45) DEFAULT NULL,
  `pressure_bleed` varchar(45) DEFAULT NULL,
  `roll_stability_dry` varchar(45) DEFAULT NULL,
  `roll_stability_wet` varchar(45) DEFAULT NULL,
  `wear` varchar(45) DEFAULT NULL,
  `ft_ir` varchar(45) DEFAULT NULL,
  `minitest_minus_40` varchar(45) DEFAULT NULL,
  `minitest_minus_30` varchar(45) DEFAULT NULL,
  `minitest_minus_20` varchar(45) DEFAULT NULL,
  `minitest_0` varchar(45) DEFAULT NULL,
  `minitest_20` varchar(45) DEFAULT NULL,
  `rheometer` varchar(45) DEFAULT NULL,
  `rheometer_temp` varchar(45) DEFAULT NULL,
  UNIQUE KEY `unique_entry` (`date`,`code`,`batch`,`pen_60x`,`drop_point`,`weld`,`wear`,`spray_off`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `testing_data`
--

LOCK TABLES `testing_data` WRITE;
/*!40000 ALTER TABLE `testing_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `testing_data` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-07-07 13:57:46
