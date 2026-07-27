import os
import re
from typing import List, Dict, Any, Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Escopos que permitem leitura do Google Drive
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def get_drive_service():
    """
    Autentica o usuário usando OAuth 2.0 (client_secret.json) 
    e retorna o serviço de API do Drive.
    Abre o navegador na primeira vez, e depois salva em token.json.
    """
    creds = None
    # O arquivo token.json armazena os tokens de acesso e atualização do usuário
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
    from google.auth.exceptions import RefreshError

    # Se não houver credenciais (ou estiverem expiradas), o usuário faz login
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                # Token expirado ou revogado (ex: invalid_grant)
                creds = None
                if os.path.exists('token.json'):
                    os.remove('token.json')

        if not creds or not creds.valid:
            if not os.path.exists('client_secret.json'):
                raise ValueError("O arquivo 'client_secret.json' não foi encontrado na raiz do backend.")
            flow = InstalledAppFlow.from_client_secrets_file(
                'client_secret.json', SCOPES)
            creds = flow.run_local_server(port=0)
            
        # Salva as credenciais para a próxima execução
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
            
    try:
        service = build('drive', 'v3', credentials=creds)
        return service
    except HttpError as error:
        raise ValueError(f"Ocorreu um erro na API do Google Drive: {error}")

def extract_folder_id(url: str) -> Optional[str]:
    """
    Extrai o ID da pasta do Google Drive a partir da URL.
    """
    match = re.search(r'folders/([a-zA-Z0-9_-]+)', url)
    if match:
        return match.group(1)
    
    match = re.search(r'id=([a-zA-Z0-9_-]+)', url)
    if match:
        return match.group(1)
        
    return None

def list_drive_folder(folder_id: str) -> List[Dict[str, Any]]:
    """
    Lista os arquivos de uma pasta do Google Drive usando OAuth.
    Como estamos usando OAuth, a pasta não precisa ser pública, desde que o usuário
    logado tenha acesso a ela!
    """
    service = get_drive_service()
    
    try:
        all_files = []
        page_token = None
        
        while True:
            results = service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, size)",
                pageSize=1000,
                orderBy="name",
                pageToken=page_token,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True
            ).execute()
            
            all_files.extend(results.get('files', []))
            page_token = results.get('nextPageToken')
            
            if not page_token:
                break
                
        return all_files
    except HttpError as error:
        print(f"[DRIVE_API_ERROR] Falha ao listar pasta {folder_id}: {error}")
        raise ValueError(f"Falha ao acessar o Google Drive. Verifique se o link é válido e se você tem acesso a ele. Erro: {error}")

def get_folder_metadata(folder_id: str) -> Dict[str, Any]:
    """
    Busca os metadados básicos de uma pasta.
    """
    service = get_drive_service()
    try:
        folder = service.files().get(
            fileId=folder_id,
            fields="id, name, mimeType",
            supportsAllDrives=True
        ).execute()
        return folder
    except HttpError as error:
        print(f"[DRIVE_API_ERROR] Falha ao buscar metadados da pasta {folder_id}: {error}")
        raise ValueError(f"Falha ao acessar a pasta do Google Drive. Verifique se o link é válido e se você tem acesso. Erro: {error}")

import io
from googleapiclient.http import MediaIoBaseDownload

def download_file(file_id: str) -> tuple[bytes, str]:
    """
    Faz o download do conteúdo de um arquivo do Google Drive para a memória.
    Retorna o conteúdo em bytes e o nome do arquivo original.
    """
    service = get_drive_service()
    try:
        file_metadata = service.files().get(fileId=file_id, fields="id, name", supportsAllDrives=True).execute()
        filename = file_metadata.get("name", f"arquivo_{file_id}")
        
        request = service.files().get_media(fileId=file_id)
        file_stream = io.BytesIO()
        downloader = MediaIoBaseDownload(file_stream, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        return file_stream.getvalue(), filename
    except HttpError as error:
        print(f"[DRIVE_API_ERROR] Falha ao fazer download do arquivo {file_id}: {error}")
        raise ValueError(f"Falha ao fazer download de arquivo do Google Drive. Erro: {error}")
