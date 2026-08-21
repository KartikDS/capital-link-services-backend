-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Aug 20, 2026 at 10:17 AM
-- Server version: 5.7.44
-- PHP Version: 8.1.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `clspubli_staging`
--

-- --------------------------------------------------------

--
-- Table structure for table `tbl_additional_services`
--

CREATE TABLE `tbl_additional_services` (
  `id` int(11) NOT NULL,
  `visa_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `short_description` text,
  `charges` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_banners`
--

CREATE TABLE `tbl_banners` (
  `id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `sub_title` varchar(255) NOT NULL,
  `banner_image` varchar(255) NOT NULL,
  `location` varchar(255) NOT NULL,
  `status` tinyint(1) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_card_types`
--

CREATE TABLE `tbl_card_types` (
  `id` int(11) NOT NULL,
  `name` char(225) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_categories`
--

CREATE TABLE `tbl_categories` (
  `id` int(11) NOT NULL,
  `country_id` int(11) DEFAULT NULL,
  `visa_type_id` int(11) DEFAULT NULL,
  `parent_id` int(11) DEFAULT '0',
  `entry_option` varchar(11) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `temp_category_id` int(11) DEFAULT NULL,
  `is_process_location` tinyint(1) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `description` text,
  `status` tinyint(1) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_category_documents`
--

CREATE TABLE `tbl_category_documents` (
  `id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `subcategory_id` int(11) DEFAULT NULL,
  `doc_id` int(11) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_category_locations`
--

CREATE TABLE `tbl_category_locations` (
  `id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `location_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_category_nationalities`
--

CREATE TABLE `tbl_category_nationalities` (
  `id` int(11) NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `nationality_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_calendar_event`
--

CREATE TABLE `tbl_cls_calendar_event` (
  `id` int(10) NOT NULL,
  `title` varchar(255) NOT NULL,
  `start_date` date NOT NULL,
  `value` text NOT NULL,
  `order_no` varchar(25) DEFAULT NULL,
  `due_date` date NOT NULL,
  `invitees` varchar(250) NOT NULL,
  `notes` text,
  `attachment` varchar(255) DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_order`
--

CREATE TABLE `tbl_cls_order` (
  `id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `visa_type` varchar(255) DEFAULT NULL,
  `order_type` int(11) DEFAULT NULL COMMENT '1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL',
  `service_id` int(11) DEFAULT NULL,
  `courier_service_id` int(11) DEFAULT NULL,
  `police_clearance_id` int(11) DEFAULT NULL,
  `russian_visa_voucher_id` int(11) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL COMMENT 'country_id',
  `departure_date` date DEFAULT NULL,
  `visa_fee` varchar(255) DEFAULT NULL,
  `no_of_traveller` int(11) DEFAULT NULL,
  `visa_application_fee` varchar(255) DEFAULT NULL,
  `service_fee` varchar(255) DEFAULT NULL,
  `additional_service_fee` varchar(255) DEFAULT NULL,
  `courier_service_fee` varchar(255) DEFAULT NULL,
  `total_fee` varchar(255) DEFAULT NULL,
  `order_contact_option` int(1) DEFAULT NULL COMMENT '1=traveller; 2=OrderContact',
  `department` varchar(255) DEFAULT NULL,
  `contact_first_name` varchar(255) DEFAULT NULL,
  `contact_last_name` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(255) DEFAULT NULL,
  `visa_cls_team_member` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy_date` date DEFAULT NULL,
  `visa_next_embassy` varchar(255) DEFAULT NULL,
  `s_admin_logged` int(11) DEFAULT NULL,
  `admin_logged_id` int(11) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL COMMENT '0=pending; 1=completed; 2=cls_confirmed',
  `process_location_group` int(11) DEFAULT NULL,
  `is_address_confirmed` int(11) DEFAULT '0',
  `date_last_saved` datetime DEFAULT NULL,
  `date_submitted` datetime DEFAULT NULL,
  `order_no` text,
  `payment_status` int(1) DEFAULT '0',
  `is_bulk` int(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_order-19-2-2021`
--

CREATE TABLE `tbl_cls_order-19-2-2021` (
  `id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `visa_type` varchar(255) DEFAULT NULL,
  `order_type` int(11) DEFAULT NULL COMMENT '1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL',
  `service_id` int(11) DEFAULT NULL,
  `courier_service_id` int(11) DEFAULT NULL,
  `police_clearance_id` int(11) DEFAULT NULL,
  `russian_visa_voucher_id` int(11) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL COMMENT 'country_id',
  `departure_date` date DEFAULT NULL,
  `visa_fee` varchar(255) DEFAULT NULL,
  `no_of_traveller` int(11) DEFAULT NULL,
  `visa_application_fee` varchar(255) DEFAULT NULL,
  `service_fee` varchar(255) DEFAULT NULL,
  `additional_service_fee` varchar(255) DEFAULT NULL,
  `courier_service_fee` varchar(255) DEFAULT NULL,
  `total_fee` varchar(255) DEFAULT NULL,
  `order_contact_option` int(1) DEFAULT NULL COMMENT '1=traveller; 2=OrderContact',
  `department` varchar(255) DEFAULT NULL,
  `contact_first_name` varchar(255) DEFAULT NULL,
  `contact_last_name` varchar(255) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(255) DEFAULT NULL,
  `visa_cls_team_member` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy_date` date DEFAULT NULL,
  `visa_next_embassy` varchar(255) DEFAULT NULL,
  `s_admin_logged` int(11) DEFAULT NULL,
  `admin_logged_id` int(11) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL COMMENT '0=pending; 1=completed; 2=cls_confirmed',
  `is_address_confirmed` int(11) DEFAULT '0',
  `date_last_saved` datetime DEFAULT NULL,
  `date_submitted` datetime DEFAULT NULL,
  `order_no` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_order_destinations`
--

CREATE TABLE `tbl_cls_order_destinations` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `visa_type_id` int(11) DEFAULT NULL,
  `entry_option` int(11) DEFAULT NULL COMMENT '1=single,2=double,3=multiple',
  `process_location_id` int(11) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `visa_additional_requirement_id` int(11) DEFAULT NULL,
  `departure_date` date DEFAULT NULL,
  `entry_date_country` date DEFAULT NULL,
  `departure_date_country` date DEFAULT NULL,
  `visa_cls_team_member` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy_date` date DEFAULT NULL,
  `visa_next_embassy` varchar(255) DEFAULT NULL,
  `visa_follow_up_date` date DEFAULT NULL,
  `travel_purpose` text,
  `selected_visa_type_price` varchar(255) DEFAULT NULL,
  `selected_additional_requirement_price` varchar(255) DEFAULT NULL,
  `selected_visa_type_requirements` text,
  `visa_date_cls_received_all_items` datetime DEFAULT NULL,
  `visa_date_submitted_for_processing` datetime DEFAULT NULL,
  `visa_date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `visa_date_order_on_route_and_closed` datetime DEFAULT NULL,
  `visa_com_note_no` varchar(255) DEFAULT NULL,
  `visa_com_note_in` varchar(255) DEFAULT NULL,
  `visa_invoice_no` varchar(255) DEFAULT NULL,
  `visa_shipped_by` varchar(255) DEFAULT NULL,
  `return_visa_shipped_by` varchar(255) DEFAULT NULL,
  `signature` text,
  `sig_name` varchar(255) DEFAULT NULL,
  `dhl_confirmation_number` varchar(100) DEFAULT NULL,
  `dhl_airwaybill_number` varchar(255) DEFAULT NULL,
  `dhl_pickup_xml_request` text,
  `dhl_pickup_xml_response` text,
  `dhl_shipment_validate_xml_request` text,
  `dhl_shipment_validate_label` longtext,
  `return_dhl_airwaybill_number` varchar(255) DEFAULT NULL,
  `return_dhl_confirmation_number` varchar(100) DEFAULT NULL,
  `return_dhl_pickup_xml_request` text,
  `return_dhl_pickup_xml_response` text,
  `return_dhl_shipment_validate_xml_request` text,
  `return_dhl_shipment_validate_label` longtext,
  `s_primary` int(11) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_order_documents`
--

CREATE TABLE `tbl_cls_order_documents` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `visa_type_id` int(11) DEFAULT NULL,
  `entry_option` int(11) DEFAULT NULL,
  `process_location_id` int(11) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `region` varchar(255) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `document_id` int(11) DEFAULT NULL,
  `traveller_id` int(11) DEFAULT NULL,
  `document` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT '0' COMMENT '0=unattended;1=uploaded;2=reviewed;3=rejected;4=approved',
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_order_document_notes`
--

CREATE TABLE `tbl_cls_order_document_notes` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `document_id` int(11) DEFAULT NULL,
  `order_document_id` int(11) DEFAULT NULL,
  `notes` text,
  `is_approved` tinyint(1) DEFAULT '0',
  `created` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cls_tpn_order_details`
--

CREATE TABLE `tbl_cls_tpn_order_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `tpn_qty` int(11) DEFAULT NULL,
  `tpn_price` varchar(255) DEFAULT NULL,
  `tpn_additional_qty` int(11) DEFAULT NULL,
  `tpn_additional_price` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_content_pages`
--

CREATE TABLE `tbl_content_pages` (
  `id` int(11) NOT NULL,
  `title` char(225) DEFAULT NULL,
  `html` longtext,
  `tags` varchar(1000) DEFAULT NULL,
  `status` char(100) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_cost_editability`
--

CREATE TABLE `tbl_cost_editability` (
  `id` int(11) NOT NULL,
  `country_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_countries`
--

CREATE TABLE `tbl_countries` (
  `id` int(11) NOT NULL,
  `country_code` varchar(11) DEFAULT '',
  `country_name` varchar(100) DEFAULT '',
  `country_name_display` varchar(200) DEFAULT NULL,
  `rep_name` varchar(225) DEFAULT NULL,
  `visa_information` longtext,
  `country_details` text,
  `main_display` int(1) DEFAULT NULL,
  `s_popular_destination` int(11) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL,
  `public_s_no_visa_required` int(1) DEFAULT NULL,
  `public_s_no_visa_required_html` longtext,
  `gov_s_no_visa_required` int(1) DEFAULT NULL,
  `gov_s_no_visa_required_html` longtext,
  `disabled` int(1) DEFAULT NULL,
  `embassy_address_line1` text,
  `embassy_address_line2` text,
  `embassy_street` text,
  `embassy_city` char(220) DEFAULT NULL,
  `embassy_state` char(220) DEFAULT NULL,
  `embassy_postcode` char(100) DEFAULT NULL,
  `embassy_phone` char(100) DEFAULT NULL,
  `country_image` varchar(225) DEFAULT NULL,
  `country_banner_image` varchar(255) DEFAULT NULL,
  `country_application_form` varchar(250) DEFAULT NULL,
  `police_clearances` int(11) DEFAULT NULL,
  `secure_document_delivery` int(11) DEFAULT NULL,
  `document_legalisation` int(11) DEFAULT NULL,
  `translation_services` int(11) DEFAULT NULL,
  `is_cls` tinyint(1) DEFAULT NULL,
  `cls_description` text,
  `cls_service_fee` varchar(255) DEFAULT NULL,
  `standard_service_fee` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_credit_card_processing`
--

CREATE TABLE `tbl_credit_card_processing` (
  `id` int(11) NOT NULL,
  `fee` double DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_departments`
--

CREATE TABLE `tbl_departments` (
  `id` int(11) NOT NULL,
  `code` char(10) DEFAULT NULL,
  `name` char(225) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_documents`
--

CREATE TABLE `tbl_documents` (
  `id` int(11) NOT NULL,
  `country_id` int(11) DEFAULT NULL,
  `visa_type_id` int(11) DEFAULT NULL,
  `entry_option` varchar(255) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL,
  `document_name` varchar(255) DEFAULT NULL,
  `description` text,
  `is_sample` tinyint(1) DEFAULT NULL,
  `sample_doc` varchar(255) DEFAULT NULL,
  `document` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_document_legalization_documents`
--

CREATE TABLE `tbl_document_legalization_documents` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `document_type` varchar(255) DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  `note` text,
  `document_file` varchar(255) DEFAULT NULL,
  `status` tinyint(4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_document_legalization_order_details`
--

CREATE TABLE `tbl_document_legalization_order_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `type_of_document` int(11) DEFAULT NULL,
  `ref_no` varchar(255) DEFAULT NULL,
  `com_invoice_no` varchar(255) DEFAULT NULL,
  `date_cls_received_all_items` datetime DEFAULT NULL,
  `date_submitted_for_processing` datetime DEFAULT NULL,
  `date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `date_order_on_route_and_closed` datetime DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_doc_legalization_attachments`
--

CREATE TABLE `tbl_doc_legalization_attachments` (
  `id` int(11) NOT NULL,
  `attachment_file` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_entry_level_categories`
--

CREATE TABLE `tbl_entry_level_categories` (
  `id` int(11) NOT NULL,
  `entry_level` varchar(255) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_free_visa_document`
--

CREATE TABLE `tbl_free_visa_document` (
  `id` int(11) NOT NULL,
  `country_id` int(11) NOT NULL,
  `visa_type` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `document_name` varchar(255) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_general_settings`
--

CREATE TABLE `tbl_general_settings` (
  `id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `field_type` varchar(225) DEFAULT NULL,
  `value` text,
  `status` int(11) DEFAULT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_home_ads`
--

CREATE TABLE `tbl_home_ads` (
  `id` int(11) NOT NULL,
  `image` varchar(1000) DEFAULT NULL,
  `link` varchar(1000) DEFAULT NULL,
  `s_enabled` int(1) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_home_image_slider`
--

CREATE TABLE `tbl_home_image_slider` (
  `id` int(11) NOT NULL,
  `image` varchar(1000) DEFAULT NULL,
  `front_html` longtext,
  `s_enabled` int(1) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_inquiries`
--

CREATE TABLE `tbl_inquiries` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `query` text NOT NULL,
  `status` char(100) NOT NULL,
  `created` datetime DEFAULT NULL,
  `updated` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_locations`
--

CREATE TABLE `tbl_locations` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `created` datetime DEFAULT CURRENT_TIMESTAMP,
  `modified` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_logs`
--

CREATE TABLE `tbl_logs` (
  `log_id` int(11) NOT NULL,
  `area` char(10) DEFAULT NULL COMMENT 'admin; dfat; client',
  `user_id` int(11) DEFAULT NULL,
  `user_type` char(20) DEFAULT NULL,
  `log_datetime` datetime DEFAULT NULL,
  `log_details` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_manual_payment`
--

CREATE TABLE `tbl_manual_payment` (
  `id` int(11) NOT NULL,
  `order_no` char(100) DEFAULT NULL,
  `cust_name` char(200) DEFAULT NULL,
  `cust_email` char(100) DEFAULT NULL,
  `items` text,
  `payment_details` text,
  `billing_details` text,
  `card_details` text,
  `grand_total` double DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_migration_debug`
--

CREATE TABLE `tbl_migration_debug` (
  `id` int(11) NOT NULL,
  `live_order_id` int(11) DEFAULT NULL,
  `current_order_id` int(11) DEFAULT NULL,
  `order_type` int(1) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `modified` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_myob_keys`
--

CREATE TABLE `tbl_myob_keys` (
  `id` int(11) NOT NULL,
  `access_token` text CHARACTER SET utf8 NOT NULL,
  `refresh_token` text CHARACTER SET utf8 NOT NULL,
  `access_code` text,
  `expire_in` varchar(225) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_myob_keys_development`
--

CREATE TABLE `tbl_myob_keys_development` (
  `id` int(11) NOT NULL,
  `access_token` text CHARACTER SET utf8 NOT NULL,
  `refresh_token` text CHARACTER SET utf8 NOT NULL,
  `access_code` text,
  `expire_in` varchar(225) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_name_title`
--

CREATE TABLE `tbl_name_title` (
  `id` int(11) NOT NULL,
  `title` char(100) DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `priority` int(11) DEFAULT NULL,
  `is_rvv` tinyint(1) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_orders`
--

CREATE TABLE `tbl_orders` (
  `order_no` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `date_last_saved` datetime DEFAULT NULL,
  `date_submitted` datetime DEFAULT NULL,
  `order_type` int(1) DEFAULT NULL COMMENT '1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL',
  `primary_traveller_name` varchar(500) DEFAULT NULL,
  `primary_traveller_passport_no` char(100) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL COMMENT 'country_id',
  `departure_date` date DEFAULT NULL,
  `pri_dept_contact_department_id` int(11) DEFAULT NULL,
  `pri_dept_contact_fname` char(100) DEFAULT NULL,
  `pri_dept_contact_lname` char(100) DEFAULT NULL,
  `pri_dept_contact_email` char(100) DEFAULT NULL,
  `pri_dept_contact_phone` char(50) DEFAULT NULL,
  `tpn_qty` int(11) DEFAULT NULL,
  `tpn_price` double DEFAULT NULL,
  `tpn_additional_qty` int(11) DEFAULT NULL,
  `tpn_additional_price` double DEFAULT NULL,
  `visa_courier` int(11) DEFAULT NULL,
  `visa_courier_price` double DEFAULT NULL,
  `visa_courier_pickup_date` date DEFAULT NULL,
  `visa_courier_pickup_ready_by_time_hr` char(10) DEFAULT NULL,
  `visa_courier_pickup_ready_by_time_min` char(10) DEFAULT NULL,
  `visa_courier_pickup_close_time_hr` char(10) DEFAULT NULL,
  `visa_courier_pickup_close_time_min` char(10) DEFAULT NULL,
  `visa_courier_pickup_contact_person_name` char(200) DEFAULT NULL,
  `visa_courier_pickup_contact_person_phone` char(100) DEFAULT NULL,
  `visa_courier_pickup_package_location` varchar(1000) DEFAULT NULL,
  `visa_mdd_company` varchar(1000) DEFAULT NULL,
  `visa_mdd_address` varchar(1000) DEFAULT NULL,
  `visa_mdd_city` varchar(500) DEFAULT NULL,
  `visa_mdd_state` varchar(500) DEFAULT NULL,
  `visa_mdd_postcode` char(100) DEFAULT NULL,
  `visa_mdd_fname` char(100) DEFAULT NULL,
  `visa_mdd_lname` char(100) DEFAULT NULL,
  `visa_mdd_contact` char(50) DEFAULT NULL,
  `visa_additional_comment` longtext,
  `visa_cls_team_member` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy` int(1) DEFAULT NULL,
  `visa_is_delivered_to_embassy_date` date DEFAULT NULL,
  `visa_next_embassy` varchar(500) DEFAULT NULL,
  `passport_office_booking_no` char(100) DEFAULT NULL,
  `passport_office_booking_time` char(50) DEFAULT NULL,
  `passport_office_booking_time_hr` char(2) DEFAULT NULL,
  `passport_office_booking_time_min` char(2) DEFAULT NULL,
  `police_clearance_id` int(11) DEFAULT NULL,
  `police_clearance_date_cls_received_all_items` datetime DEFAULT NULL,
  `police_clearance_date_submitted_for_processing` datetime DEFAULT NULL,
  `police_clearance_date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `police_clearance_date_order_on_route_and_closed` datetime DEFAULT NULL,
  `doc_delivery_type` int(11) DEFAULT NULL,
  `doc_receiver_name` char(225) DEFAULT NULL,
  `doc_pickup_address` varchar(1000) DEFAULT NULL,
  `doc_pickup_city` varchar(1000) DEFAULT NULL,
  `doc_pickup_postcode` char(100) DEFAULT NULL,
  `doc_pickup_contact_no` char(100) DEFAULT NULL,
  `doc_pickup_contact_area` varchar(1000) DEFAULT NULL,
  `doc_pickup_email` char(100) DEFAULT NULL,
  `doc_pickup_company` char(100) DEFAULT NULL,
  `doc_pickup_contact_name` char(100) DEFAULT NULL,
  `doc_delivery_company` char(100) DEFAULT NULL,
  `doc_delivery_recipient_name` char(225) DEFAULT NULL,
  `doc_delivery_address` varchar(1000) DEFAULT NULL,
  `doc_delivery_city` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode` char(100) DEFAULT NULL,
  `doc_delivery_contact_no` char(100) DEFAULT NULL,
  `doc_delivery_email` char(100) DEFAULT NULL,
  `doc_delivery_security_no` char(100) DEFAULT NULL,
  `doc_delivery_company_alt1` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_name` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_area` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_no` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_email` char(100) DEFAULT NULL,
  `doc_pickup_contact_area_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_recipient_name_alt1` char(225) DEFAULT NULL,
  `doc_delivery_address_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_city_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode_alt1` char(100) DEFAULT NULL,
  `doc_delivery_contact_no_alt1` char(100) DEFAULT NULL,
  `doc_delivery_company_alt2` char(100) DEFAULT NULL,
  `doc_pickup_contact_area_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_recipient_name_alt2` char(225) DEFAULT NULL,
  `doc_delivery_address_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_city_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode_alt2` char(100) DEFAULT NULL,
  `doc_delivery_contact_no_alt2` char(100) DEFAULT NULL,
  `doc_package_total_pieces` int(11) DEFAULT NULL,
  `doc_package_pickup_date` date DEFAULT NULL,
  `doc_package_ready_hr` char(2) DEFAULT NULL,
  `doc_package_ready_min` char(2) DEFAULT NULL,
  `doc_package_ready_ampm` char(2) DEFAULT NULL,
  `doc_package_office_close_hr` char(2) DEFAULT NULL,
  `doc_package_office_close_ampm` char(2) DEFAULT NULL,
  `doc_package_office_close_min` char(2) DEFAULT NULL,
  `russian_visa_voucher_id` int(11) DEFAULT NULL,
  `russian_visa_voucher_col_no` int(11) DEFAULT NULL,
  `russian_visa_voucher_col_cost` double DEFAULT NULL,
  `rvv_first_entry_date` date DEFAULT NULL,
  `rvv_first_departure_date` date DEFAULT NULL,
  `rvv_second_entry_date` date DEFAULT NULL,
  `rvv_second_departure_date` date DEFAULT NULL,
  `rvv_list_of_cities` varchar(1000) DEFAULT NULL,
  `rvv_list_of_hotels` varchar(1000) DEFAULT NULL,
  `rvv_visa_applied_at` varchar(1000) DEFAULT NULL,
  `rvv_file` varchar(1000) DEFAULT NULL,
  `rvv_comments` longtext,
  `dl_company` varchar(1000) DEFAULT NULL,
  `dl_nationality` int(11) DEFAULT NULL,
  `dl_address` varchar(1000) DEFAULT NULL,
  `dl_city` char(220) DEFAULT NULL,
  `dl_state` char(220) DEFAULT NULL,
  `dl_postcode` char(100) DEFAULT NULL,
  `dl_contact_name` char(220) DEFAULT NULL,
  `dl_mobile` char(220) DEFAULT NULL,
  `dl_email` char(220) DEFAULT NULL,
  `dl_date_doc_returned` char(20) DEFAULT NULL,
  `dl_embassy` int(11) DEFAULT NULL,
  `dl_ref_no` char(220) DEFAULT NULL,
  `dl_com_invoice_no` char(220) DEFAULT NULL,
  `dl_payment_type` char(100) DEFAULT NULL,
  `dl_visa_shipped_by` varchar(1000) DEFAULT NULL,
  `dl_visa_com_note_no` varchar(1000) DEFAULT NULL,
  `dl_visa_com_note_in` varchar(1000) DEFAULT NULL,
  `dl_visa_invoice_no` varchar(1000) DEFAULT NULL,
  `is_smart_traveller` int(1) DEFAULT NULL COMMENT '0=no; 1=yes',
  `discount_code` char(225) DEFAULT NULL,
  `discount_rate` double DEFAULT NULL,
  `grand_total` double DEFAULT NULL,
  `s_doc_sent` int(1) DEFAULT NULL,
  `date_doc_sent` char(10) DEFAULT NULL,
  `date_completed` date DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '1=destination; 2=Review TPN; 3=Review Order; 4=Place Order; 10= ordered; 11=paid; 12=completed',
  `s_archive` int(1) DEFAULT NULL,
  `s_bulk_order` int(11) DEFAULT NULL,
  `signature` text,
  `sig_name` char(250) DEFAULT NULL,
  `dhl_pickup_xml_request` text,
  `dhl_pickup_xml_response` text,
  `dhl_shipment_validate_xml_request` text,
  `dhl_shipment_validate_xml_response` text,
  `sender_name` char(100) DEFAULT NULL,
  `sender_signature` text,
  `sender_signed_datetime` datetime DEFAULT NULL,
  `s_admin_logged` int(1) DEFAULT '0',
  `admin_logged_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_orders-21-2-2021`
--

CREATE TABLE `tbl_orders-21-2-2021` (
  `order_no` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `date_last_saved` datetime DEFAULT NULL,
  `date_submitted` datetime DEFAULT NULL,
  `order_type` int(1) DEFAULT NULL COMMENT '1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance; 6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL',
  `primary_traveller_name` varchar(500) DEFAULT NULL,
  `primary_traveller_passport_no` char(100) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL COMMENT 'country_id',
  `departure_date` date DEFAULT NULL,
  `pri_dept_contact_department_id` int(11) DEFAULT NULL,
  `pri_dept_contact_fname` char(100) DEFAULT NULL,
  `pri_dept_contact_lname` char(100) DEFAULT NULL,
  `pri_dept_contact_email` char(100) DEFAULT NULL,
  `pri_dept_contact_phone` char(50) DEFAULT NULL,
  `tpn_qty` int(11) DEFAULT NULL,
  `tpn_price` double DEFAULT NULL,
  `tpn_additional_qty` int(11) DEFAULT NULL,
  `tpn_additional_price` double DEFAULT NULL,
  `visa_courier` int(11) DEFAULT NULL,
  `visa_courier_price` double DEFAULT NULL,
  `visa_courier_pickup_date` date DEFAULT NULL,
  `visa_courier_pickup_ready_by_time_hr` char(10) DEFAULT NULL,
  `visa_courier_pickup_ready_by_time_min` char(10) DEFAULT NULL,
  `visa_courier_pickup_close_time_hr` char(10) DEFAULT NULL,
  `visa_courier_pickup_close_time_min` char(10) DEFAULT NULL,
  `visa_courier_pickup_contact_person_name` char(200) DEFAULT NULL,
  `visa_courier_pickup_contact_person_phone` char(100) DEFAULT NULL,
  `visa_courier_pickup_package_location` varchar(1000) DEFAULT NULL,
  `visa_mdd_company` varchar(1000) DEFAULT NULL,
  `visa_mdd_address` varchar(1000) DEFAULT NULL,
  `visa_mdd_city` varchar(500) DEFAULT NULL,
  `visa_mdd_state` varchar(500) DEFAULT NULL,
  `visa_mdd_postcode` char(100) DEFAULT NULL,
  `visa_mdd_fname` char(100) DEFAULT NULL,
  `visa_mdd_lname` char(100) DEFAULT NULL,
  `visa_mdd_contact` char(50) DEFAULT NULL,
  `visa_additional_comment` longtext,
  `visa_cls_team_member` int(11) DEFAULT NULL,
  `visa_is_delivered_to_embassy` int(1) DEFAULT NULL,
  `visa_is_delivered_to_embassy_date` date DEFAULT NULL,
  `visa_next_embassy` varchar(500) DEFAULT NULL,
  `passport_office_booking_no` char(100) DEFAULT NULL,
  `passport_office_booking_time` char(50) DEFAULT NULL,
  `passport_office_booking_time_hr` char(2) DEFAULT NULL,
  `passport_office_booking_time_min` char(2) DEFAULT NULL,
  `police_clearance_id` int(11) DEFAULT NULL,
  `police_clearance_date_cls_received_all_items` datetime DEFAULT NULL,
  `police_clearance_date_submitted_for_processing` datetime DEFAULT NULL,
  `police_clearance_date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `police_clearance_date_order_on_route_and_closed` datetime DEFAULT NULL,
  `doc_delivery_type` int(11) DEFAULT NULL,
  `doc_receiver_name` char(225) DEFAULT NULL,
  `doc_pickup_address` varchar(1000) DEFAULT NULL,
  `doc_pickup_city` varchar(1000) DEFAULT NULL,
  `doc_pickup_postcode` char(100) DEFAULT NULL,
  `doc_pickup_contact_no` char(100) DEFAULT NULL,
  `doc_pickup_contact_area` varchar(1000) DEFAULT NULL,
  `doc_pickup_email` char(100) DEFAULT NULL,
  `doc_pickup_company` char(100) DEFAULT NULL,
  `doc_pickup_contact_name` char(100) DEFAULT NULL,
  `doc_delivery_company` char(100) DEFAULT NULL,
  `doc_delivery_recipient_name` char(225) DEFAULT NULL,
  `doc_delivery_address` varchar(1000) DEFAULT NULL,
  `doc_delivery_city` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode` char(100) DEFAULT NULL,
  `doc_delivery_contact_no` char(100) DEFAULT NULL,
  `doc_delivery_email` char(100) DEFAULT NULL,
  `doc_delivery_security_no` char(100) DEFAULT NULL,
  `doc_service_code` varchar(50) DEFAULT NULL,
  `doc_package_condition` tinyint(1) DEFAULT '0',
  `doc_comment` text,
  `doc_delivery_company_alt1` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_name` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_area` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_contact_no` char(100) DEFAULT NULL,
  `doc_delivery_primary_receipient_email` char(100) DEFAULT NULL,
  `doc_pickup_contact_area_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_recipient_name_alt1` char(225) DEFAULT NULL,
  `doc_delivery_address_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_city_alt1` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode_alt1` char(100) DEFAULT NULL,
  `doc_delivery_contact_no_alt1` char(100) DEFAULT NULL,
  `doc_delivery_company_alt2` char(100) DEFAULT NULL,
  `doc_pickup_contact_area_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_recipient_name_alt2` char(225) DEFAULT NULL,
  `doc_delivery_address_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_city_alt2` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode_alt2` char(100) DEFAULT NULL,
  `doc_delivery_contact_no_alt2` char(100) DEFAULT NULL,
  `doc_package_total_pieces` int(11) DEFAULT NULL,
  `doc_package_pickup_date` date DEFAULT NULL,
  `doc_package_ready_hr` char(2) DEFAULT NULL,
  `doc_package_ready_min` char(2) DEFAULT NULL,
  `doc_package_ready_ampm` char(2) DEFAULT NULL,
  `doc_package_office_close_hr` char(2) DEFAULT NULL,
  `doc_package_office_close_ampm` char(2) DEFAULT NULL,
  `doc_package_office_close_min` char(2) DEFAULT NULL,
  `russian_visa_voucher_id` int(11) DEFAULT NULL,
  `russian_visa_voucher_col_no` int(11) DEFAULT NULL,
  `russian_visa_voucher_col_cost` double DEFAULT NULL,
  `rvv_first_entry_date` date DEFAULT NULL,
  `rvv_first_departure_date` date DEFAULT NULL,
  `rvv_second_entry_date` date DEFAULT NULL,
  `rvv_second_departure_date` date DEFAULT NULL,
  `rvv_multiple_entry_date` date DEFAULT NULL,
  `rvv_multiple_departure_date` date DEFAULT NULL,
  `rvv_list_of_cities` varchar(1000) DEFAULT NULL,
  `rvv_list_of_hotels` varchar(1000) DEFAULT NULL,
  `rvv_visa_applied_at` varchar(1000) DEFAULT NULL,
  `rvv_file` varchar(1000) DEFAULT NULL,
  `rvv_comments` longtext,
  `dl_company` varchar(1000) DEFAULT NULL,
  `dl_nationality` int(11) DEFAULT NULL,
  `dl_address` varchar(1000) DEFAULT NULL,
  `dl_city` char(220) DEFAULT NULL,
  `dl_state` char(220) DEFAULT NULL,
  `dl_postcode` char(100) DEFAULT NULL,
  `dl_contact_name` char(220) DEFAULT NULL,
  `dl_mobile` char(220) DEFAULT NULL,
  `dl_email` char(220) DEFAULT NULL,
  `dl_date_doc_returned` char(20) DEFAULT NULL,
  `dl_embassy` int(11) DEFAULT NULL,
  `dl_ref_no` char(220) DEFAULT NULL,
  `dl_com_invoice_no` char(220) DEFAULT NULL,
  `dl_payment_type` char(100) DEFAULT NULL,
  `dl_visa_shipped_by` varchar(1000) DEFAULT NULL,
  `dl_visa_com_note_no` varchar(1000) DEFAULT NULL,
  `dl_visa_com_note_in` varchar(1000) DEFAULT NULL,
  `dl_visa_invoice_no` varchar(1000) DEFAULT NULL,
  `is_smart_traveller` int(1) DEFAULT NULL COMMENT '0=no; 1=yes',
  `discount_code` char(225) DEFAULT NULL,
  `discount_rate` double DEFAULT NULL,
  `grand_total` double DEFAULT NULL,
  `s_doc_sent` int(1) DEFAULT NULL,
  `date_doc_sent` char(10) DEFAULT NULL,
  `date_completed` date DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '1=destination; 2=Review TPN; 3=Review Order; 4=Place Order; 10= ordered; 11=paid; 12=completed',
  `s_archive` int(1) DEFAULT NULL,
  `s_bulk_order` int(11) DEFAULT NULL,
  `signature` text,
  `sig_name` char(250) DEFAULT NULL,
  `dhl_pickup_xml_request` text,
  `dhl_pickup_xml_response` text,
  `dhl_shipment_validate_xml_request` text,
  `dhl_shipment_validate_xml_response` text,
  `sender_name` char(100) DEFAULT NULL,
  `sender_signature` text,
  `sender_signed_datetime` datetime DEFAULT NULL,
  `s_admin_logged` int(1) DEFAULT '0',
  `admin_logged_id` int(11) DEFAULT NULL,
  `weight` int(11) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_additional_services`
--

CREATE TABLE `tbl_order_additional_services` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `additional_service_id` int(11) DEFAULT NULL,
  `additional_service_fee` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_bulk_public_visa`
--

CREATE TABLE `tbl_order_bulk_public_visa` (
  `bulk_order_no` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `status` char(10) DEFAULT NULL COMMENT 'draft; sent',
  `level` int(1) DEFAULT NULL COMMENT '1=details; 2=review; 3=place order',
  `discount_rate` double DEFAULT NULL,
  `discount_code` char(225) DEFAULT NULL,
  `grand_total` double DEFAULT NULL,
  `payment_option` int(1) DEFAULT NULL,
  `date_last_saved` datetime DEFAULT NULL,
  `dd_company` char(220) DEFAULT NULL,
  `dd_doc_return_address` varchar(1000) DEFAULT NULL,
  `dd_city` char(220) DEFAULT NULL,
  `dd_state` char(220) DEFAULT NULL,
  `dd_postcode` char(50) DEFAULT NULL,
  `dd_fname` char(220) DEFAULT NULL,
  `dd_lname` char(220) DEFAULT NULL,
  `dd_contact_no` char(50) DEFAULT NULL,
  `dd_additional_comment` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_bulk_public_visa_details`
--

CREATE TABLE `tbl_order_bulk_public_visa_details` (
  `id` int(11) NOT NULL,
  `bulk_order_no` int(11) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL,
  `departure_date` date DEFAULT NULL,
  `entry_date_country` date DEFAULT NULL,
  `departure_date_country` date DEFAULT NULL,
  `travel_purpose` text,
  `selected_visa_type` int(11) DEFAULT NULL,
  `selected_visa_type_price` double DEFAULT NULL,
  `selected_visa_type_requirements` text,
  `visa_courier` int(11) DEFAULT NULL,
  `visa_courier_price` double DEFAULT NULL,
  `traveller_title` int(11) DEFAULT NULL,
  `traveller_fname` char(220) DEFAULT NULL,
  `traveller_mname` char(220) DEFAULT NULL,
  `traveller_lname` char(220) DEFAULT NULL,
  `traveller_email` char(220) DEFAULT NULL,
  `traveller_occupation` char(220) DEFAULT NULL,
  `traveller_phone` char(50) DEFAULT NULL,
  `traveller_bday` date DEFAULT NULL,
  `traveller_passport_type` int(11) DEFAULT NULL,
  `traveller_nationality` int(11) DEFAULT NULL,
  `traveller_passport_no` char(220) DEFAULT NULL,
  `is_smart_traveller` int(11) DEFAULT NULL,
  `dd_company` char(220) DEFAULT NULL,
  `dd_doc_return_address` varchar(1000) DEFAULT NULL,
  `dd_city` char(220) DEFAULT NULL,
  `dd_state` char(220) DEFAULT NULL,
  `dd_postcode` char(50) DEFAULT NULL,
  `dd_fname` char(220) DEFAULT NULL,
  `dd_lname` char(220) DEFAULT NULL,
  `dd_contact_no` char(50) DEFAULT NULL,
  `dd_additional_comment` text,
  `discount_rate` double DEFAULT NULL,
  `discount_code` char(220) DEFAULT NULL,
  `total` double DEFAULT NULL,
  `final_total` double DEFAULT NULL,
  `generated_order_no` int(11) DEFAULT NULL,
  `travellers` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_courier_service_details`
--

CREATE TABLE `tbl_order_courier_service_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `courier_service_id` int(11) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `courier_pickup_date` date DEFAULT NULL,
  `courier_pickup_ready_by_time_hr` varchar(255) DEFAULT NULL,
  `courier_pickup_ready_by_time_min` varchar(255) DEFAULT NULL,
  `courier_pickup_close_time_hr` varchar(255) DEFAULT NULL,
  `courier_pickup_close_time_min` varchar(255) DEFAULT NULL,
  `courier_pickup_first_name` varchar(255) DEFAULT NULL,
  `courier_pickup_last_name` varchar(255) DEFAULT NULL,
  `courier_pickup_email` varchar(255) DEFAULT NULL,
  `courier_pickup_contact_number` varchar(255) DEFAULT NULL,
  `courier_pickup_company` varchar(255) DEFAULT NULL,
  `courier_pickup_address` varchar(255) DEFAULT NULL,
  `courier_pickup_city` varchar(255) DEFAULT NULL,
  `courier_pickup_state` varchar(255) DEFAULT NULL,
  `courier_pickup_country_id` int(11) DEFAULT NULL,
  `courier_pickup_postcode` varchar(255) DEFAULT NULL,
  `courier_pickup_additional_comment` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_destinations`
--

CREATE TABLE `tbl_order_destinations` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `departure_date` date DEFAULT NULL,
  `entry_option` int(1) DEFAULT NULL COMMENT '1=single; 2=double; 3=multiple',
  `entry_date_country` date DEFAULT NULL,
  `departure_date_country` date DEFAULT NULL,
  `travel_purpose` longtext,
  `selected_visa_type` int(11) DEFAULT NULL,
  `selected_visa_type_price` double DEFAULT NULL,
  `selected_visa_type_requirements` varchar(1000) DEFAULT NULL,
  `s_primary` int(1) DEFAULT NULL,
  `status` int(1) DEFAULT NULL,
  `visa_date_cls_received_all_items` datetime DEFAULT NULL,
  `visa_date_submitted_for_processing` datetime DEFAULT NULL,
  `visa_date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `visa_date_order_on_route_and_closed` datetime DEFAULT NULL,
  `visa_shipped_by` varchar(1000) DEFAULT NULL,
  `visa_com_note_no` varchar(1000) DEFAULT NULL,
  `visa_com_note_in` varchar(1000) DEFAULT NULL,
  `visa_invoice_no` varchar(1000) DEFAULT NULL,
  `visa_follow_up_date` date DEFAULT NULL,
  `tpn_stat` int(11) DEFAULT NULL,
  `tpn_middle_src` longtext,
  `tpn_date_issued` char(100) DEFAULT NULL,
  `signature` text,
  `sig_hash` varchar(128) DEFAULT NULL,
  `sig_name` char(150) DEFAULT NULL,
  `dhl_airwaybill_number` char(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_destination_add_reqs_for_visa`
--

CREATE TABLE `tbl_order_destination_add_reqs_for_visa` (
  `id` int(11) NOT NULL,
  `visa_req_id` int(11) DEFAULT NULL,
  `visa_req_price` double DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_destination_notes`
--

CREATE TABLE `tbl_order_destination_notes` (
  `id` int(11) NOT NULL,
  `destination_id` int(11) DEFAULT NULL,
  `note` longtext,
  `date_added` datetime DEFAULT NULL,
  `note_by` int(11) DEFAULT NULL,
  `note_by_name` char(225) DEFAULT NULL,
  `user_type` char(20) DEFAULT NULL,
  `is_pin` int(1) DEFAULT '0',
  `is_admin` int(1) DEFAULT '0',
  `attachment` varchar(500) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_dl_checklist`
--

CREATE TABLE `tbl_order_dl_checklist` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `type` varchar(1000) DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  `note` longtext,
  `doc_file` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_dl_quotes`
--

CREATE TABLE `tbl_order_dl_quotes` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `price` double DEFAULT NULL,
  `gst` int(11) DEFAULT NULL,
  `total` double DEFAULT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `sent_group` int(11) DEFAULT NULL,
  `sent_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_doc_delivery_details`
--

CREATE TABLE `tbl_order_doc_delivery_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `secuirity_number` varchar(255) DEFAULT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `contact_area` varchar(255) DEFAULT NULL,
  `receiver_contact_name` varchar(255) DEFAULT NULL,
  `receiver_contact_area` varchar(255) DEFAULT NULL,
  `primary_receipient_name` varchar(255) DEFAULT NULL,
  `primary_receipient_area` varchar(255) DEFAULT NULL,
  `primary_receipient_email` varchar(255) DEFAULT NULL,
  `primary_receipient_contact_no` varchar(255) DEFAULT NULL,
  `alternative_receipient_name_first` varchar(255) DEFAULT NULL,
  `alternative_receipient_area_first` varchar(255) DEFAULT NULL,
  `alternative_receipient_phone_first` varchar(255) DEFAULT NULL,
  `alternative_receipient_name_second` varchar(255) DEFAULT NULL,
  `alternative_receipient_area_second` varchar(255) DEFAULT NULL,
  `alternative_receipient_phone_second` varchar(255) DEFAULT NULL,
  `package_total_pieces` int(11) DEFAULT NULL,
  `package_pickup_date` date DEFAULT NULL,
  `package_weight` varchar(255) DEFAULT NULL,
  `package_weight_price` varchar(255) DEFAULT NULL,
  `package_extra_weight` varchar(255) DEFAULT NULL,
  `package_extra_weight_price` varchar(255) DEFAULT NULL,
  `package_total_weight_price` varchar(255) DEFAULT NULL,
  `package_ready_time_by_hr` int(11) DEFAULT NULL,
  `package_ready_time_by_min` int(11) DEFAULT NULL,
  `package_ready_time_by_am_pm` varchar(255) DEFAULT NULL,
  `package_close_time_by_hr` int(11) DEFAULT NULL,
  `package_close_time_by_min` int(11) DEFAULT NULL,
  `package_close_time_by_am_pm` varchar(255) DEFAULT NULL,
  `payment_doc_type` varchar(255) DEFAULT NULL,
  `service_code` varchar(255) DEFAULT NULL,
  `ref_no` varchar(255) DEFAULT NULL,
  `is_delivered_to_embassy` int(11) DEFAULT NULL,
  `delivered_to_embassy_date` date DEFAULT NULL,
  `date_submitted_for_processing` datetime DEFAULT NULL,
  `package_condition` tinyint(1) DEFAULT NULL,
  `comment` text
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_follow_up_date`
--

CREATE TABLE `tbl_order_follow_up_date` (
  `id` int(11) NOT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `follow_up_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_notes`
--

CREATE TABLE `tbl_order_notes` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `note` longtext,
  `document_type` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `price` float(10,2) DEFAULT '0.00',
  `status` varchar(100) DEFAULT NULL,
  `date_added` datetime DEFAULT NULL,
  `note_by` int(11) DEFAULT NULL,
  `note_by_name` char(225) DEFAULT NULL,
  `user_type` char(20) DEFAULT NULL,
  `is_admin` int(1) DEFAULT '0',
  `is_deleted` int(1) NOT NULL DEFAULT '0'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_passport_applicants`
--

CREATE TABLE `tbl_order_passport_applicants` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `fullname` varchar(1000) DEFAULT NULL,
  `personal_passport` int(1) DEFAULT NULL,
  `diplomatic_official_passport` int(1) DEFAULT NULL,
  `birth_certificate` int(1) DEFAULT NULL,
  `marriage_certificate` int(1) DEFAULT NULL,
  `certificate_of_australian_citizenship` int(1) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_police_clearance_applicants`
--

CREATE TABLE `tbl_order_police_clearance_applicants` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `fname` char(100) DEFAULT NULL,
  `mname` char(100) DEFAULT NULL,
  `lname` char(100) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `phone` char(20) DEFAULT NULL,
  `mobile` char(20) DEFAULT NULL,
  `address` longtext,
  `city` varchar(500) DEFAULT NULL,
  `postcode` char(100) DEFAULT NULL,
  `state` char(100) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `passport_no` char(200) DEFAULT NULL,
  `departure_date` date DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_return_document_details`
--

CREATE TABLE `tbl_order_return_document_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `first_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `contact_number` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `postcode` varchar(255) DEFAULT NULL,
  `returning_date` date DEFAULT NULL,
  `additional_comment` text,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_travellers`
--

CREATE TABLE `tbl_order_travellers` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `title` int(11) DEFAULT NULL,
  `fname` char(100) DEFAULT NULL,
  `mname` char(100) DEFAULT NULL,
  `lname` char(100) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `gender` char(10) DEFAULT NULL COMMENT 'male; female',
  `nearest_capital_city` char(100) DEFAULT NULL,
  `organisation` varchar(1000) DEFAULT NULL,
  `occupation` varchar(225) DEFAULT NULL,
  `rpinfo_fullname` char(225) DEFAULT NULL,
  `rpinfo_position_at_post` char(225) DEFAULT NULL,
  `rpinfo_name_of_post` varchar(500) DEFAULT NULL,
  `rpinfo_city` varchar(500) DEFAULT NULL,
  `phone` char(50) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL COMMENT 'country_id',
  `passport_number` char(100) DEFAULT NULL,
  `passport_type` int(11) DEFAULT NULL,
  `s_primary` int(1) DEFAULT NULL,
  `rvv_citizenship` varchar(1000) DEFAULT NULL,
  `rvv_sex` char(10) DEFAULT NULL,
  `rvv_birth_place` varchar(1000) DEFAULT NULL,
  `rvv_passport_issue_date` date DEFAULT NULL,
  `rvv_passport_exp_date` date DEFAULT NULL,
  `rvv_company` varchar(1000) DEFAULT NULL,
  `rvv_position` varchar(1000) DEFAULT NULL,
  `rvv_city` varchar(1000) DEFAULT NULL,
  `rvv_state` varchar(1000) DEFAULT NULL,
  `rvv_postcode` char(225) DEFAULT NULL,
  `rvv_country` int(11) DEFAULT NULL,
  `rvv_company_fax` char(225) DEFAULT NULL,
  `rvv_address` varchar(1000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_order_traveller_details`
--

CREATE TABLE `tbl_order_traveller_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `first_name` varchar(255) DEFAULT NULL,
  `middle_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `nearest_capital_city` varchar(255) DEFAULT NULL,
  `organisation` varchar(255) DEFAULT NULL,
  `citizenship` int(11) DEFAULT NULL,
  `occupation` varchar(255) DEFAULT NULL,
  `rpinfo_fullname` varchar(255) DEFAULT NULL,
  `rpinfo_position_at_post` varchar(255) DEFAULT NULL,
  `rpinfo_name_of_post` varchar(255) DEFAULT NULL,
  `rpinfo_city` varchar(255) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `passport_type` int(11) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `passport_number` varchar(255) DEFAULT NULL,
  `passport_issue_date` date DEFAULT NULL,
  `passport_expiry_date` date DEFAULT NULL,
  `departure_date` date DEFAULT NULL,
  `is_client` tinyint(1) DEFAULT NULL,
  `is_primary` tinyint(1) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_passport_types`
--

CREATE TABLE `tbl_passport_types` (
  `id` int(11) NOT NULL,
  `type` char(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_payment`
--

CREATE TABLE `tbl_payment` (
  `id` int(11) NOT NULL,
  `client_id` int(11) DEFAULT NULL,
  `order_no` int(11) DEFAULT NULL,
  `date_paid` datetime DEFAULT NULL,
  `fname` char(225) DEFAULT NULL,
  `lname` char(225) DEFAULT NULL,
  `email` char(225) DEFAULT NULL,
  `phone` char(50) DEFAULT NULL,
  `mobile` char(50) DEFAULT NULL,
  `address` varchar(5000) DEFAULT NULL,
  `city` char(225) DEFAULT NULL,
  `state` char(100) DEFAULT NULL,
  `postcode` char(50) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `additional_address_details` longtext,
  `department_id` int(11) DEFAULT NULL,
  `mba_organisation_name` varchar(1000) DEFAULT NULL,
  `mba_fname` char(225) DEFAULT NULL,
  `mba_lname` char(225) DEFAULT NULL,
  `mba_address` varchar(5000) DEFAULT NULL,
  `mba_city` char(225) DEFAULT NULL,
  `mba_state` char(100) DEFAULT NULL,
  `mba_postcode` char(50) DEFAULT NULL,
  `mba_country_id` int(11) DEFAULT NULL,
  `payment_option` int(11) DEFAULT NULL COMMENT '0 = account; 1=creditcard',
  `account_no` char(50) DEFAULT NULL,
  `name_on_card` varchar(1000) DEFAULT NULL,
  `card_number` char(50) DEFAULT NULL,
  `card_expiry_month` int(2) DEFAULT NULL,
  `card_expiry_year` int(4) DEFAULT NULL,
  `card_type` int(11) DEFAULT NULL,
  `ccv_number` char(50) DEFAULT NULL,
  `doc_receiver_name` char(225) DEFAULT NULL,
  `doc_pickup_address` varchar(1000) DEFAULT NULL,
  `doc_pickup_city` varchar(1000) DEFAULT NULL,
  `doc_pickup_postcode` char(100) DEFAULT NULL,
  `doc_pickup_contact_no` char(100) DEFAULT NULL,
  `doc_delivery_recipient_name` char(225) DEFAULT NULL,
  `doc_delivery_address` varchar(1000) DEFAULT NULL,
  `doc_delivery_city` varchar(1000) DEFAULT NULL,
  `doc_delivery_postcode` char(100) DEFAULT NULL,
  `doc_delivery_contact_no` char(100) DEFAULT NULL,
  `doc_package_total_pieces` int(11) DEFAULT NULL,
  `doc_package_pickup_date` date DEFAULT NULL,
  `doc_package_ready_hr` char(2) DEFAULT NULL,
  `doc_package_ready_min` char(2) DEFAULT NULL,
  `doc_package_office_close_hr` char(2) DEFAULT NULL,
  `doc_package_office_close_min` char(2) DEFAULT NULL,
  `total_order_price` double DEFAULT NULL,
  `s_paid` int(1) DEFAULT NULL COMMENT '1=online; 2=by account',
  `transaction_id` varchar(255) DEFAULT NULL,
  `payment_status` tinyint(4) DEFAULT NULL COMMENT '0=>failed,1=>complete'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_police_clearances`
--

CREATE TABLE `tbl_police_clearances` (
  `id` int(11) NOT NULL,
  `name` varchar(500) DEFAULT NULL,
  `price` double DEFAULT NULL,
  `name_additional` varchar(500) DEFAULT NULL,
  `price_additional` double DEFAULT NULL,
  `status` int(1) DEFAULT NULL,
  `file_path` varchar(1000) DEFAULT NULL,
  `gen_info` longtext
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_police_clearance_order_details`
--

CREATE TABLE `tbl_police_clearance_order_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `police_clearance_id` int(11) DEFAULT NULL,
  `clearance_price` varchar(255) DEFAULT NULL,
  `basic_additional_price` varchar(255) DEFAULT NULL,
  `clearance_additional_price` varchar(255) DEFAULT NULL,
  `date_cls_received_all_items` datetime DEFAULT NULL,
  `date_submitted_for_processing` datetime DEFAULT NULL,
  `date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `date_order_on_route_and_closed` datetime DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_public_visa_additional_requirements`
--

CREATE TABLE `tbl_public_visa_additional_requirements` (
  `id` int(11) NOT NULL,
  `visa_id` int(11) DEFAULT NULL,
  `requirement` char(225) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `s_required` int(1) DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '1=active; 0=inactive',
  `item_order` int(11) DEFAULT NULL,
  `visa_type` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_public_visa_drop_down`
--

CREATE TABLE `tbl_public_visa_drop_down` (
  `id` int(11) NOT NULL,
  `visa_id` int(11) DEFAULT NULL,
  `visa_label` varchar(100) DEFAULT NULL,
  `visa_information` longtext,
  `status` int(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_public_visa_types`
--

CREATE TABLE `tbl_public_visa_types` (
  `id` int(11) NOT NULL,
  `country_id` int(11) DEFAULT NULL,
  `type` char(100) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `file_attachment` varchar(1000) DEFAULT NULL,
  `second_file_attachment` varchar(255) DEFAULT NULL,
  `bulk_document_pack_attachment` varchar(255) DEFAULT NULL,
  `status` int(1) DEFAULT NULL,
  `is_process_location` tinyint(1) DEFAULT NULL,
  `visa_information` longtext,
  `processing_time` text,
  `visa_label` varchar(100) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_public_visa_type_locations`
--

CREATE TABLE `tbl_public_visa_type_locations` (
  `id` int(11) NOT NULL,
  `visa_type_id` int(11) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `location_group` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_russian_visa_voucher_order_details`
--

CREATE TABLE `tbl_russian_visa_voucher_order_details` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `russian_visa_voucher_id` int(11) DEFAULT NULL,
  `voucher_col` int(11) DEFAULT NULL,
  `voucher_col_cost` varchar(255) DEFAULT NULL,
  `first_entry_date` date DEFAULT NULL,
  `first_departure_date` date DEFAULT NULL,
  `double_entry_date` date DEFAULT NULL,
  `double_departure_date` date DEFAULT NULL,
  `multiple_entry_date` date DEFAULT NULL,
  `multiple_departure_date` date DEFAULT NULL,
  `list_of_cities` varchar(255) DEFAULT NULL,
  `list_of_hotels` text,
  `visa_applied_at` varchar(255) DEFAULT NULL,
  `passport_file` varchar(255) DEFAULT NULL,
  `comment` text,
  `company` varchar(255) DEFAULT NULL,
  `position` char(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `state` varchar(255) DEFAULT NULL,
  `postcode` varchar(255) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `company_phone` varchar(255) DEFAULT NULL,
  `date_cls_received_all_items` datetime DEFAULT NULL,
  `date_submitted_for_processing` datetime DEFAULT NULL,
  `date_completed_and_received_at_cls` datetime DEFAULT NULL,
  `date_order_on_route_and_closed` datetime DEFAULT NULL,
  `address` text,
  `status` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_russian_visa_voucher_types`
--

CREATE TABLE `tbl_russian_visa_voucher_types` (
  `id` int(11) NOT NULL,
  `type` char(225) DEFAULT NULL,
  `name` varchar(1000) DEFAULT NULL,
  `three_days_process_fee` double DEFAULT NULL,
  `one_two_days_process_fee` double DEFAULT NULL,
  `twelve_hrs_process_fee` double DEFAULT NULL,
  `thirteen_days` double DEFAULT NULL,
  `four_days` double DEFAULT NULL,
  `entry_option` varchar(255) DEFAULT NULL,
  `s_active` int(1) DEFAULT NULL,
  `type_order` varchar(1000) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_saudi_invitation_letters`
--

CREATE TABLE `tbl_saudi_invitation_letters` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `parent_id` int(11) DEFAULT '0',
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `file` varchar(255) DEFAULT NULL,
  `passport_number` varchar(255) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `nationality` int(11) DEFAULT NULL,
  `issuing_location` varchar(255) DEFAULT NULL,
  `destination` int(11) DEFAULT NULL,
  `visa_type` int(11) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `entry_option` int(11) DEFAULT NULL,
  `duration_of_stay` varchar(255) DEFAULT NULL,
  `validity` varchar(255) DEFAULT NULL,
  `occupation` varchar(255) DEFAULT NULL,
  `sponsor_name` varchar(255) DEFAULT NULL,
  `sponsor_id_number` varchar(255) DEFAULT NULL,
  `sponsor_phone` varchar(255) DEFAULT NULL,
  `sponsor_address` text,
  `multi_apply_before_date` datetime DEFAULT NULL,
  `comment` text,
  `invitation_file` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `modified_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_scan_group`
--

CREATE TABLE `tbl_scan_group` (
  `id` int(11) NOT NULL,
  `order_no` int(11) DEFAULT NULL,
  `type` char(100) DEFAULT NULL,
  `status` char(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_sections`
--

CREATE TABLE `tbl_sections` (
  `id` int(11) NOT NULL,
  `section_key` char(255) DEFAULT NULL,
  `title` char(255) DEFAULT NULL,
  `content` longtext,
  `image` char(255) DEFAULT NULL,
  `page_slug` char(255) DEFAULT NULL,
  `status` char(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_services`
--

CREATE TABLE `tbl_services` (
  `id` int(11) NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `sub_title` varchar(255) DEFAULT NULL,
  `short_description` text,
  `image` varchar(255) DEFAULT NULL,
  `charges` varchar(255) DEFAULT NULL,
  `status` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_settings_discount`
--

CREATE TABLE `tbl_settings_discount` (
  `id` int(11) NOT NULL,
  `name` char(225) DEFAULT NULL,
  `code` varbinary(225) DEFAULT NULL,
  `rate` double DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_settings_document_delivery`
--

CREATE TABLE `tbl_settings_document_delivery` (
  `id` int(11) NOT NULL,
  `type` char(225) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '1=enabled; 0=disabled'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_settings_passport`
--

CREATE TABLE `tbl_settings_passport` (
  `id` int(11) NOT NULL,
  `cost` double DEFAULT NULL,
  `additional_cost` double DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_settings_tpn`
--

CREATE TABLE `tbl_settings_tpn` (
  `id` int(11) NOT NULL,
  `tpn` double DEFAULT NULL,
  `tpn_additional` double DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_states`
--

CREATE TABLE `tbl_states` (
  `id` int(11) NOT NULL,
  `name` char(225) DEFAULT NULL,
  `code` char(5) DEFAULT NULL,
  `s_main` int(11) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_state_categories`
--

CREATE TABLE `tbl_state_categories` (
  `id` int(11) NOT NULL,
  `state_code` varchar(255) DEFAULT NULL,
  `category_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_suggestions`
--

CREATE TABLE `tbl_suggestions` (
  `id` int(11) NOT NULL,
  `suggestion_field` varchar(255) DEFAULT NULL,
  `info` text,
  `status` tinyint(1) DEFAULT NULL,
  `created` datetime DEFAULT NULL,
  `modified` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_terminals`
--

CREATE TABLE `tbl_terminals` (
  `id` int(11) NOT NULL,
  `terminal_name` varchar(225) DEFAULT NULL,
  `popular_terminal` smallint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_tpn`
--

CREATE TABLE `tbl_tpn` (
  `tpn_no` char(12) NOT NULL,
  `date_submitted` datetime DEFAULT NULL,
  `date_last_updated` datetime DEFAULT NULL,
  `date_issued` datetime DEFAULT NULL,
  `order_no` int(11) DEFAULT NULL,
  `client_id` int(11) DEFAULT NULL,
  `tpn_src` longtext,
  `tpn_src_previous` longtext,
  `tpn_src_original_approved` longtext,
  `destination` int(11) DEFAULT NULL,
  `departure_date` date DEFAULT NULL,
  `entry_option` int(1) DEFAULT NULL,
  `entry_date_country` date DEFAULT NULL,
  `departure_date_country` date DEFAULT NULL,
  `travel_purpose` longtext,
  `is_seen` int(11) DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '0=pending; 1=approved; 2=rejected'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_tpn_notes`
--

CREATE TABLE `tbl_tpn_notes` (
  `id` int(11) NOT NULL,
  `tpn_no` char(15) DEFAULT NULL,
  `note` longtext,
  `date_added` datetime DEFAULT NULL,
  `note_by` int(11) DEFAULT NULL,
  `user_type` char(50) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_translation_services`
--

CREATE TABLE `tbl_translation_services` (
  `id` int(11) NOT NULL,
  `full_name` varchar(225) DEFAULT NULL,
  `email` varchar(225) DEFAULT NULL,
  `phone` varchar(225) DEFAULT NULL,
  `language_from` varchar(225) DEFAULT NULL,
  `language_to` varchar(255) DEFAULT NULL,
  `document_name` varchar(225) DEFAULT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_traveller_information`
--

CREATE TABLE `tbl_traveller_information` (
  `id` int(11) NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `deliver_visa_time` datetime NOT NULL,
  `entry_date` datetime NOT NULL,
  `exit_date` datetime NOT NULL,
  `is_fast_track` smallint(2) NOT NULL,
  `no_of_traveller` int(11) NOT NULL,
  `fname` varchar(225) NOT NULL,
  `lname` varchar(225) NOT NULL,
  `password` varchar(225) NOT NULL,
  `dob` datetime NOT NULL,
  `phone` varchar(225) NOT NULL,
  `email` varchar(225) NOT NULL,
  `has_passport_type` smallint(2) NOT NULL,
  `passport_number` varchar(225) NOT NULL,
  `passport_expiration_date` datetime NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_traveller_order_contact`
--

CREATE TABLE `tbl_traveller_order_contact` (
  `id` int(11) NOT NULL,
  `traveller_id` int(11) NOT NULL,
  `contact_type` smallint(2) NOT NULL,
  `fname` varchar(225) NOT NULL,
  `lname` varchar(225) NOT NULL,
  `dob` datetime NOT NULL,
  `phone` varchar(225) NOT NULL,
  `email` varchar(225) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_travel_alerts`
--

CREATE TABLE `tbl_travel_alerts` (
  `id` int(11) NOT NULL,
  `alert_date` date DEFAULT NULL,
  `subject` varchar(1000) DEFAULT NULL,
  `featured_image` varchar(255) DEFAULT NULL,
  `body` text,
  `admin_id` int(11) DEFAULT NULL,
  `status` char(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_user_admin`
--

CREATE TABLE `tbl_user_admin` (
  `id` int(11) NOT NULL,
  `last_login` char(20) DEFAULT NULL,
  `fname` char(50) DEFAULT NULL,
  `lname` char(50) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `password` char(100) DEFAULT NULL,
  `reset_pin` char(10) DEFAULT NULL,
  `s_enabled` int(1) DEFAULT NULL,
  `s_driver` int(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_user_client`
--

CREATE TABLE `tbl_user_client` (
  `id` int(11) NOT NULL,
  `type` char(100) DEFAULT NULL COMMENT 'government, public, corporate',
  `display_id` varchar(255) DEFAULT NULL,
  `title` char(10) DEFAULT NULL,
  `fname` char(50) DEFAULT NULL,
  `lname` char(50) DEFAULT NULL,
  `password` char(100) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `phone` char(50) DEFAULT NULL,
  `mobile` char(50) DEFAULT NULL,
  `profile_pic` varchar(255) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `company` varchar(1000) DEFAULT NULL,
  `address` char(225) DEFAULT NULL,
  `city` char(225) DEFAULT NULL,
  `state` char(225) DEFAULT NULL,
  `postcode` char(50) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `mdda_address` varchar(5000) DEFAULT NULL,
  `mdda_city` char(225) DEFAULT NULL,
  `mdda_state` char(100) DEFAULT NULL,
  `mdda_postcode` char(50) DEFAULT NULL,
  `mdda_country_id` int(11) DEFAULT NULL,
  `mba_address` char(225) DEFAULT NULL,
  `mba_city` char(100) DEFAULT NULL,
  `mba_state` char(100) DEFAULT NULL,
  `mba_postcode` char(50) DEFAULT NULL,
  `mba_country_id` int(11) DEFAULT NULL,
  `passport_number` varchar(255) DEFAULT NULL,
  `passport_photo` varchar(255) DEFAULT NULL,
  `can_charge_cost_to_account` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `account_no` char(50) DEFAULT NULL,
  `can_get_special_price` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `special_price` int(3) DEFAULT NULL,
  `reset_pin` char(10) DEFAULT NULL,
  `s_enabled` int(1) DEFAULT NULL,
  `s_archive` int(1) DEFAULT NULL,
  `activation_code` varchar(255) DEFAULT NULL,
  `is_address_confirmed` tinyint(1) DEFAULT '0' COMMENT '0=>''not confirmed'',1=>''confirmed''',
  `last_login` date DEFAULT NULL,
  `passport_updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_user_client-issuetest`
--

CREATE TABLE `tbl_user_client-issuetest` (
  `id` int(11) NOT NULL,
  `type` char(100) DEFAULT NULL COMMENT 'government, public, corporate',
  `display_id` varchar(255) DEFAULT NULL,
  `title` char(10) DEFAULT NULL,
  `fname` char(50) DEFAULT NULL,
  `lname` char(50) DEFAULT NULL,
  `password` char(100) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `phone` char(50) DEFAULT NULL,
  `mobile` char(50) DEFAULT NULL,
  `profile_pic` varchar(255) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  `company` varchar(1000) DEFAULT NULL,
  `address` char(225) DEFAULT NULL,
  `city` char(225) DEFAULT NULL,
  `state` char(225) DEFAULT NULL,
  `postcode` char(50) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `mdda_address` varchar(5000) DEFAULT NULL,
  `mdda_city` char(225) DEFAULT NULL,
  `mdda_state` char(100) DEFAULT NULL,
  `mdda_postcode` char(50) DEFAULT NULL,
  `mdda_country_id` int(11) DEFAULT NULL,
  `mba_address` char(225) DEFAULT NULL,
  `mba_city` char(100) DEFAULT NULL,
  `mba_state` char(100) DEFAULT NULL,
  `mba_postcode` char(50) DEFAULT NULL,
  `mba_country_id` int(11) DEFAULT NULL,
  `passport_number` varchar(255) DEFAULT NULL,
  `passport_photo` varchar(255) DEFAULT NULL,
  `can_charge_cost_to_account` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `account_no` char(50) DEFAULT NULL,
  `can_get_special_price` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `special_price` int(3) DEFAULT NULL,
  `reset_pin` char(10) DEFAULT NULL,
  `s_enabled` int(1) DEFAULT NULL,
  `s_archive` int(1) DEFAULT NULL,
  `activation_code` varchar(255) DEFAULT NULL,
  `is_address_confirmed` tinyint(1) DEFAULT '0' COMMENT '0=>''not confirmed'',1=>''confirmed''',
  `last_login` date DEFAULT NULL,
  `passport_updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_user_embassy`
--

CREATE TABLE `tbl_user_embassy` (
  `id` int(11) NOT NULL,
  `country` int(11) DEFAULT NULL,
  `title` int(11) DEFAULT NULL,
  `fname` char(220) DEFAULT NULL,
  `lname` char(220) DEFAULT NULL,
  `email` char(220) DEFAULT NULL,
  `password` char(220) DEFAULT NULL,
  `phone` char(100) DEFAULT NULL,
  `mobile` char(100) DEFAULT NULL,
  `notes` longtext,
  `process_location_group` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  `reset_pin` char(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_user_tpn`
--

CREATE TABLE `tbl_user_tpn` (
  `id` int(11) NOT NULL,
  `date_last_login` datetime DEFAULT NULL,
  `fname` char(50) DEFAULT NULL,
  `lname` char(50) DEFAULT NULL,
  `email` char(100) DEFAULT NULL,
  `phone` char(50) DEFAULT NULL,
  `password` char(100) DEFAULT NULL,
  `reset_pin` char(10) DEFAULT NULL,
  `s_enabled` int(1) DEFAULT NULL COMMENT '1=enabled; 0 = disabled'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_video_tutorials`
--

CREATE TABLE `tbl_video_tutorials` (
  `id` int(11) NOT NULL,
  `title` char(100) DEFAULT NULL,
  `video` char(220) DEFAULT NULL,
  `type` char(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_visa_additional_requirements`
--

CREATE TABLE `tbl_visa_additional_requirements` (
  `id` int(11) NOT NULL,
  `visa_id` int(11) DEFAULT NULL,
  `requirement` char(225) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `s_required` int(1) DEFAULT NULL,
  `status` int(1) DEFAULT NULL COMMENT '1=active; 0=inactive',
  `item_order` int(11) DEFAULT NULL,
  `visa_type` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_visa_courier_options`
--

CREATE TABLE `tbl_visa_courier_options` (
  `id` int(11) NOT NULL,
  `type` char(225) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `courier_icon` varchar(255) DEFAULT NULL,
  `s_active` int(1) DEFAULT NULL COMMENT '1=Active; 0=Inactive',
  `s_available_for_gov` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `s_available_for_public` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `s_dhl` int(1) DEFAULT NULL COMMENT '1=yes; 0=no',
  `is_courier_service` int(11) DEFAULT NULL,
  `is_airport_to_airport` tinyint(1) DEFAULT NULL,
  `is_document_delivery` tinyint(1) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_visa_popup_content`
--

CREATE TABLE `tbl_visa_popup_content` (
  `id` int(11) NOT NULL,
  `content` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_visa_types`
--

CREATE TABLE `tbl_visa_types` (
  `id` int(11) NOT NULL,
  `country_id` int(11) DEFAULT NULL,
  `type` char(100) DEFAULT NULL,
  `cost` double DEFAULT NULL,
  `file_attachment` varchar(1000) DEFAULT NULL,
  `second_file_attachment` varchar(255) DEFAULT NULL,
  `visa_information` longtext,
  `status` int(11) DEFAULT NULL COMMENT '1=active; 0=inactive'
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_weight_price`
--

CREATE TABLE `tbl_weight_price` (
  `id` int(11) NOT NULL,
  `weight_upper_limit` int(11) NOT NULL,
  `weight_lower_limit` int(11) NOT NULL,
  `price` double NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tbl_additional_services`
--
ALTER TABLE `tbl_additional_services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_banners`
--
ALTER TABLE `tbl_banners`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_card_types`
--
ALTER TABLE `tbl_card_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_categories`
--
ALTER TABLE `tbl_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_category_documents`
--
ALTER TABLE `tbl_category_documents`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_category_locations`
--
ALTER TABLE `tbl_category_locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_category_nationalities`
--
ALTER TABLE `tbl_category_nationalities`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_calendar_event`
--
ALTER TABLE `tbl_cls_calendar_event`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_order`
--
ALTER TABLE `tbl_cls_order`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_order-19-2-2021`
--
ALTER TABLE `tbl_cls_order-19-2-2021`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_order_destinations`
--
ALTER TABLE `tbl_cls_order_destinations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_order_documents`
--
ALTER TABLE `tbl_cls_order_documents`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_order_document_notes`
--
ALTER TABLE `tbl_cls_order_document_notes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cls_tpn_order_details`
--
ALTER TABLE `tbl_cls_tpn_order_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_content_pages`
--
ALTER TABLE `tbl_content_pages`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_cost_editability`
--
ALTER TABLE `tbl_cost_editability`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_countries`
--
ALTER TABLE `tbl_countries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_credit_card_processing`
--
ALTER TABLE `tbl_credit_card_processing`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_departments`
--
ALTER TABLE `tbl_departments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_documents`
--
ALTER TABLE `tbl_documents`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_document_legalization_documents`
--
ALTER TABLE `tbl_document_legalization_documents`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_document_legalization_order_details`
--
ALTER TABLE `tbl_document_legalization_order_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_doc_legalization_attachments`
--
ALTER TABLE `tbl_doc_legalization_attachments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_entry_level_categories`
--
ALTER TABLE `tbl_entry_level_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_free_visa_document`
--
ALTER TABLE `tbl_free_visa_document`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_general_settings`
--
ALTER TABLE `tbl_general_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_home_ads`
--
ALTER TABLE `tbl_home_ads`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_home_image_slider`
--
ALTER TABLE `tbl_home_image_slider`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_inquiries`
--
ALTER TABLE `tbl_inquiries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_locations`
--
ALTER TABLE `tbl_locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_logs`
--
ALTER TABLE `tbl_logs`
  ADD PRIMARY KEY (`log_id`);

--
-- Indexes for table `tbl_manual_payment`
--
ALTER TABLE `tbl_manual_payment`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_migration_debug`
--
ALTER TABLE `tbl_migration_debug`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_myob_keys`
--
ALTER TABLE `tbl_myob_keys`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_myob_keys_development`
--
ALTER TABLE `tbl_myob_keys_development`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_name_title`
--
ALTER TABLE `tbl_name_title`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_orders`
--
ALTER TABLE `tbl_orders`
  ADD PRIMARY KEY (`order_no`),
  ADD KEY `client_id` (`client_id`);

--
-- Indexes for table `tbl_orders-21-2-2021`
--
ALTER TABLE `tbl_orders-21-2-2021`
  ADD PRIMARY KEY (`order_no`),
  ADD KEY `client_id` (`client_id`);

--
-- Indexes for table `tbl_order_additional_services`
--
ALTER TABLE `tbl_order_additional_services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_bulk_public_visa`
--
ALTER TABLE `tbl_order_bulk_public_visa`
  ADD PRIMARY KEY (`bulk_order_no`);

--
-- Indexes for table `tbl_order_bulk_public_visa_details`
--
ALTER TABLE `tbl_order_bulk_public_visa_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_courier_service_details`
--
ALTER TABLE `tbl_order_courier_service_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_destinations`
--
ALTER TABLE `tbl_order_destinations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_no` (`order_no`),
  ADD KEY `country_id` (`country_id`);

--
-- Indexes for table `tbl_order_destination_add_reqs_for_visa`
--
ALTER TABLE `tbl_order_destination_add_reqs_for_visa`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_destination_notes`
--
ALTER TABLE `tbl_order_destination_notes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_dl_checklist`
--
ALTER TABLE `tbl_order_dl_checklist`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_dl_quotes`
--
ALTER TABLE `tbl_order_dl_quotes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_doc_delivery_details`
--
ALTER TABLE `tbl_order_doc_delivery_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_follow_up_date`
--
ALTER TABLE `tbl_order_follow_up_date`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_notes`
--
ALTER TABLE `tbl_order_notes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_passport_applicants`
--
ALTER TABLE `tbl_order_passport_applicants`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_police_clearance_applicants`
--
ALTER TABLE `tbl_order_police_clearance_applicants`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_return_document_details`
--
ALTER TABLE `tbl_order_return_document_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_order_travellers`
--
ALTER TABLE `tbl_order_travellers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `passport_type` (`passport_type`),
  ADD KEY `order_no` (`order_no`),
  ADD KEY `nationality` (`nationality`);

--
-- Indexes for table `tbl_order_traveller_details`
--
ALTER TABLE `tbl_order_traveller_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_passport_types`
--
ALTER TABLE `tbl_passport_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_payment`
--
ALTER TABLE `tbl_payment`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_police_clearances`
--
ALTER TABLE `tbl_police_clearances`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_police_clearance_order_details`
--
ALTER TABLE `tbl_police_clearance_order_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_public_visa_additional_requirements`
--
ALTER TABLE `tbl_public_visa_additional_requirements`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_public_visa_drop_down`
--
ALTER TABLE `tbl_public_visa_drop_down`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_public_visa_types`
--
ALTER TABLE `tbl_public_visa_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_public_visa_type_locations`
--
ALTER TABLE `tbl_public_visa_type_locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_russian_visa_voucher_order_details`
--
ALTER TABLE `tbl_russian_visa_voucher_order_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_russian_visa_voucher_types`
--
ALTER TABLE `tbl_russian_visa_voucher_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_saudi_invitation_letters`
--
ALTER TABLE `tbl_saudi_invitation_letters`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_scan_group`
--
ALTER TABLE `tbl_scan_group`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_sections`
--
ALTER TABLE `tbl_sections`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `section_key` (`section_key`);

--
-- Indexes for table `tbl_services`
--
ALTER TABLE `tbl_services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_settings_discount`
--
ALTER TABLE `tbl_settings_discount`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_settings_document_delivery`
--
ALTER TABLE `tbl_settings_document_delivery`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_settings_passport`
--
ALTER TABLE `tbl_settings_passport`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_settings_tpn`
--
ALTER TABLE `tbl_settings_tpn`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_states`
--
ALTER TABLE `tbl_states`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_state_categories`
--
ALTER TABLE `tbl_state_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_suggestions`
--
ALTER TABLE `tbl_suggestions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_terminals`
--
ALTER TABLE `tbl_terminals`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_tpn`
--
ALTER TABLE `tbl_tpn`
  ADD PRIMARY KEY (`tpn_no`);

--
-- Indexes for table `tbl_tpn_notes`
--
ALTER TABLE `tbl_tpn_notes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_translation_services`
--
ALTER TABLE `tbl_translation_services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_traveller_information`
--
ALTER TABLE `tbl_traveller_information`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_traveller_order_contact`
--
ALTER TABLE `tbl_traveller_order_contact`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_travel_alerts`
--
ALTER TABLE `tbl_travel_alerts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_user_admin`
--
ALTER TABLE `tbl_user_admin`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_user_client`
--
ALTER TABLE `tbl_user_client`
  ADD PRIMARY KEY (`id`),
  ADD KEY `department_id` (`department_id`);

--
-- Indexes for table `tbl_user_client-issuetest`
--
ALTER TABLE `tbl_user_client-issuetest`
  ADD PRIMARY KEY (`id`),
  ADD KEY `department_id` (`department_id`);

--
-- Indexes for table `tbl_user_embassy`
--
ALTER TABLE `tbl_user_embassy`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_user_tpn`
--
ALTER TABLE `tbl_user_tpn`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_video_tutorials`
--
ALTER TABLE `tbl_video_tutorials`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_visa_additional_requirements`
--
ALTER TABLE `tbl_visa_additional_requirements`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_visa_courier_options`
--
ALTER TABLE `tbl_visa_courier_options`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_visa_popup_content`
--
ALTER TABLE `tbl_visa_popup_content`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_visa_types`
--
ALTER TABLE `tbl_visa_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_weight_price`
--
ALTER TABLE `tbl_weight_price`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tbl_additional_services`
--
ALTER TABLE `tbl_additional_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_banners`
--
ALTER TABLE `tbl_banners`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_card_types`
--
ALTER TABLE `tbl_card_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_categories`
--
ALTER TABLE `tbl_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_category_documents`
--
ALTER TABLE `tbl_category_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_category_locations`
--
ALTER TABLE `tbl_category_locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_category_nationalities`
--
ALTER TABLE `tbl_category_nationalities`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_calendar_event`
--
ALTER TABLE `tbl_cls_calendar_event`
  MODIFY `id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_order`
--
ALTER TABLE `tbl_cls_order`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_order-19-2-2021`
--
ALTER TABLE `tbl_cls_order-19-2-2021`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_order_destinations`
--
ALTER TABLE `tbl_cls_order_destinations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_order_documents`
--
ALTER TABLE `tbl_cls_order_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_order_document_notes`
--
ALTER TABLE `tbl_cls_order_document_notes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cls_tpn_order_details`
--
ALTER TABLE `tbl_cls_tpn_order_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_content_pages`
--
ALTER TABLE `tbl_content_pages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_cost_editability`
--
ALTER TABLE `tbl_cost_editability`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_countries`
--
ALTER TABLE `tbl_countries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_departments`
--
ALTER TABLE `tbl_departments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_documents`
--
ALTER TABLE `tbl_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_document_legalization_documents`
--
ALTER TABLE `tbl_document_legalization_documents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_document_legalization_order_details`
--
ALTER TABLE `tbl_document_legalization_order_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_entry_level_categories`
--
ALTER TABLE `tbl_entry_level_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_free_visa_document`
--
ALTER TABLE `tbl_free_visa_document`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_general_settings`
--
ALTER TABLE `tbl_general_settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_home_ads`
--
ALTER TABLE `tbl_home_ads`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_home_image_slider`
--
ALTER TABLE `tbl_home_image_slider`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_inquiries`
--
ALTER TABLE `tbl_inquiries`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_locations`
--
ALTER TABLE `tbl_locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_logs`
--
ALTER TABLE `tbl_logs`
  MODIFY `log_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_manual_payment`
--
ALTER TABLE `tbl_manual_payment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_migration_debug`
--
ALTER TABLE `tbl_migration_debug`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_myob_keys`
--
ALTER TABLE `tbl_myob_keys`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_myob_keys_development`
--
ALTER TABLE `tbl_myob_keys_development`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_name_title`
--
ALTER TABLE `tbl_name_title`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_orders`
--
ALTER TABLE `tbl_orders`
  MODIFY `order_no` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_orders-21-2-2021`
--
ALTER TABLE `tbl_orders-21-2-2021`
  MODIFY `order_no` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_additional_services`
--
ALTER TABLE `tbl_order_additional_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_bulk_public_visa`
--
ALTER TABLE `tbl_order_bulk_public_visa`
  MODIFY `bulk_order_no` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_bulk_public_visa_details`
--
ALTER TABLE `tbl_order_bulk_public_visa_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_courier_service_details`
--
ALTER TABLE `tbl_order_courier_service_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_destinations`
--
ALTER TABLE `tbl_order_destinations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_destination_add_reqs_for_visa`
--
ALTER TABLE `tbl_order_destination_add_reqs_for_visa`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_destination_notes`
--
ALTER TABLE `tbl_order_destination_notes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_dl_checklist`
--
ALTER TABLE `tbl_order_dl_checklist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_dl_quotes`
--
ALTER TABLE `tbl_order_dl_quotes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_doc_delivery_details`
--
ALTER TABLE `tbl_order_doc_delivery_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_follow_up_date`
--
ALTER TABLE `tbl_order_follow_up_date`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_notes`
--
ALTER TABLE `tbl_order_notes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_passport_applicants`
--
ALTER TABLE `tbl_order_passport_applicants`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_police_clearance_applicants`
--
ALTER TABLE `tbl_order_police_clearance_applicants`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_return_document_details`
--
ALTER TABLE `tbl_order_return_document_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_travellers`
--
ALTER TABLE `tbl_order_travellers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_order_traveller_details`
--
ALTER TABLE `tbl_order_traveller_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_passport_types`
--
ALTER TABLE `tbl_passport_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_payment`
--
ALTER TABLE `tbl_payment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_police_clearances`
--
ALTER TABLE `tbl_police_clearances`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_police_clearance_order_details`
--
ALTER TABLE `tbl_police_clearance_order_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_public_visa_additional_requirements`
--
ALTER TABLE `tbl_public_visa_additional_requirements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_public_visa_drop_down`
--
ALTER TABLE `tbl_public_visa_drop_down`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_public_visa_types`
--
ALTER TABLE `tbl_public_visa_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_public_visa_type_locations`
--
ALTER TABLE `tbl_public_visa_type_locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_russian_visa_voucher_order_details`
--
ALTER TABLE `tbl_russian_visa_voucher_order_details`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_russian_visa_voucher_types`
--
ALTER TABLE `tbl_russian_visa_voucher_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_saudi_invitation_letters`
--
ALTER TABLE `tbl_saudi_invitation_letters`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_scan_group`
--
ALTER TABLE `tbl_scan_group`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_sections`
--
ALTER TABLE `tbl_sections`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_services`
--
ALTER TABLE `tbl_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_settings_discount`
--
ALTER TABLE `tbl_settings_discount`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_settings_document_delivery`
--
ALTER TABLE `tbl_settings_document_delivery`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_settings_tpn`
--
ALTER TABLE `tbl_settings_tpn`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_states`
--
ALTER TABLE `tbl_states`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_state_categories`
--
ALTER TABLE `tbl_state_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_suggestions`
--
ALTER TABLE `tbl_suggestions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_terminals`
--
ALTER TABLE `tbl_terminals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_tpn_notes`
--
ALTER TABLE `tbl_tpn_notes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_translation_services`
--
ALTER TABLE `tbl_translation_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_traveller_information`
--
ALTER TABLE `tbl_traveller_information`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_traveller_order_contact`
--
ALTER TABLE `tbl_traveller_order_contact`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_travel_alerts`
--
ALTER TABLE `tbl_travel_alerts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_user_admin`
--
ALTER TABLE `tbl_user_admin`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_user_client`
--
ALTER TABLE `tbl_user_client`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_user_client-issuetest`
--
ALTER TABLE `tbl_user_client-issuetest`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_user_embassy`
--
ALTER TABLE `tbl_user_embassy`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_user_tpn`
--
ALTER TABLE `tbl_user_tpn`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_video_tutorials`
--
ALTER TABLE `tbl_video_tutorials`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_visa_additional_requirements`
--
ALTER TABLE `tbl_visa_additional_requirements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_visa_courier_options`
--
ALTER TABLE `tbl_visa_courier_options`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_visa_popup_content`
--
ALTER TABLE `tbl_visa_popup_content`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_visa_types`
--
ALTER TABLE `tbl_visa_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_weight_price`
--
ALTER TABLE `tbl_weight_price`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
