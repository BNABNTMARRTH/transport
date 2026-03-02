#!/bin/bash

# reversePort - Universal Installer 🐙
# Estilo: Profesional / Abismo

set -e

# Colores técnicos
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear

echo -e "${MAGENTA}   +-----------------------------------------------------------+"
echo -e "   |                                                           |"
echo -e "   |  ██████╗ ███████╗██╗   ██╗███████╗██████╗ ███████╗███████╗|"
echo -e "   |  ██╔══██╗██╔════╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝|"
echo -e "   |  ██████╔╝█████╗  ██║   ██║█████╗  ██████╔╝███████╗█████╗  |"
echo -e "   |  ██╔══██╗██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  |"
echo -e "   |  ██║  ██║███████╗ ╚████╔╝ ███████╗██║  ██║███████║███████╗|"
echo -e "   |  ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝|"
echo -e "   |                                                           |"
echo -e "   |            I N S T A L A D O R   A B I S A L              |"
echo -e "   |                          v1.0.0                           |"
echo -e "   +-----------------------------------------------------------+${NC}"

echo -e "\n${BOLD}[ SISTEMA ] Iniciando instalación de reversePort...${NC}"

# Verificar dependencias
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js no está instalado. Por favor instálalo primero.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR] npm no está instalado.${NC}"
    exit 1
fi

# Carpeta temporal
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo -e "${CYAN}[1/3] Descargando componentes del cliente...${NC}"
# Nota: En producción esto descargaría un tarball del VPS o un repo de Git.
# Por ahora simulamos la descarga del repositorio oficial.
git clone --depth 1 https://github.com/vuestro-repo/reverseport.git . &> /dev/null || {
    # Si falla el git (porque no existe el repo aún), usamos un fallback 
    # En el futuro esto será un curl a reverseport.net/download/client.tar.gz
    echo -e "${RED}[ERROR] No se pudo establecer conexión con el repositorio maestro.${NC}"
    exit 1
}

cd client

echo -e "${CYAN}[2/3] Configurando entorno de ejecución...${NC}"
npm install --quiet

echo -e "${CYAN}[3/3] Activando comando global 'reverseport'...${NC}"
sudo npm install -g . --quiet

echo -e "\n${GREEN}${BOLD}¡INSTALACION COMPLETADA CON EXITO!${NC}"
echo -e "${NC}Ahora puedes usar el comando ${BOLD}reverseport${NC} desde cualquier lugar."
echo -e "${NC}Simplemente escribe: ${CYAN}reverseport${NC} en tu terminal.\n"

# Limpieza
rm -rf "$TEMP_DIR"
