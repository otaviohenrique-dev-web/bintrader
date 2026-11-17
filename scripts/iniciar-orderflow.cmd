@echo off
rem Inicia o OrderFlow Lab (API + interface na porta 3001) a partir da pasta do projeto.
rem Para iniciar junto com o Windows, veja docs/04-uso-e-persistencia.md
cd /d "%~dp0.."
title OrderFlow Lab
npm start
