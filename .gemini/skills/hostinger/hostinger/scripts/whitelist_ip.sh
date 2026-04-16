#!/bin/bash

ACTION=${1:-get}
FIREWALL_ID=$2
IP_ADDRESS=$3
PORT=$4

if [ -z "$HOSTINGER_API" ]; then
  echo "Error: HOSTINGER_API must be set." >&2
  exit 1
fi

if [ "$ACTION" = "get" ]; then
  curl -s --location 'https://developers.hostinger.com/api/vps/v1/firewall' \
       --header 'Accept: application/json' \
       --header "Authorization: Bearer $HOSTINGER_API"
elif [ "$ACTION" = "whitelist" ]; then
  if [ -z "$FIREWALL_ID" ] || [ -z "$IP_ADDRESS" ] || [ -z "$PORT" ]; then
    echo "Error: FIREWALL_ID, IP_ADDRESS, and PORT are required for whitelist action." >&2
    exit 1
  fi
  
  curl -s --location "https://developers.hostinger.com/api/vps/v1/firewall/$FIREWALL_ID/rules" \
       --header 'Content-Type: application/json' \
       --header 'Accept: application/json' \
       --header "Authorization: Bearer $HOSTINGER_API" \
       --data "{
         \"protocol\": \"TCP\",
         \"port\": \"$PORT\",
         \"source\": \"custom\",
         \"source_detail\": \"$IP_ADDRESS\"
       }"
else
  echo "Unknown action: $ACTION" >&2
  exit 1
fi
