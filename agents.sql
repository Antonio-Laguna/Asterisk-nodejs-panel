CREATE TABLE `agentes` (
  `id` int(11) NOT NULL auto_increment,
  `movil` tinyint(1) default '1' COMMENT 'Can the user call to mobile phones?',
  `nacional` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to national phones?',
  `especiales` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to special phones?',
  `ochocientos` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to 800 phones?',
  `novecientos` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to 900 phones?',
  `informacion` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to info phones?',
  `internacional` tinyint(1) NOT NULL default '1' COMMENT 'Can the user call to international phones?',
  `cid` varchar(25) default NULL COMMENT 'Caller ID',
  `codAgente` varchar(8) NOT NULL default '00000000'COMMENT 'User to log on the phone',
  `clave` varchar(10) NOT NULL COMMENT 'Password to log on the phone',
  `nombre` varchar(50) NOT NULL COMMENT 'Name',
  `apellido1` varchar(50) NOT NULL COMMENT 'First surname',
  `apellido2` varchar(50) default NULL COMMENT 'Second surname',
  `email` varchar(100) default NULL,
  `usuario` varchar(45) default NULL COMMENT 'User to log in the application',
  `grupo` int(11) default '0' COMMENT 'Group in ACL',
  PRIMARY KEY  (`id`),
  KEY `codAgente` (`codAgente`),
  KEY `usuario` (`usuario`),
  KEY `grupo` (`grupo`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;