
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Circle, 
  useMap, 
  useMapEvents,
  Tooltip
} from 'react-leaflet';
import L from 'leaflet';
import { 
  Trash2, 
  Menu, 
  X, 
  LocateFixed, 
  Layers, 
  AlertCircle, 
  RefreshCw, 
  Edit3, 
  Download, 
  Upload, 
  Eraser, 
  Map as MapIcon, 
  Sun, 
  Moon, 
  Users, 
  Copy, 
  Check, 
  Info, 
  ChevronRight, 
  ArrowRightCircle, 
  ArrowLeftCircle, 
  AlertTriangle, 
  Radio,
  Wifi,
  Navigation,
  Loader2,
  Plus
} from 'lucide-react';
import { GeoPoint, UserLocation, ActivityLog, RemoteUser } from './types';
import { calculateDistance } from './utils/geo';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const createRemoteUserIcon = (color: string, name: string) => {
  const initial = (name || 'U').charAt(0).toUpperCase();
  return L.divIcon({
    className: 'custom-user-icon',
    html: `
      <div class="flex flex-col items-center">
        <div style="background-color: ${color}" class="w-11 h-11 rounded-full border-[3px] border-white shadow-2xl flex items-center justify-center text-white font-black text-base transition-transform hover:scale-110">
          ${initial}
        </div>
        <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white"></div>
      </div>
    `,
    iconSize: [44, 52],
    iconAnchor: [22, 52]
  });
};

const createNumberedIcon = (number: number, isEditing: boolean = false) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative flex flex-col items-center ${isEditing ? 'scale-125 z-[999]' : ''} p-4 -m-4">
        <div class="${isEditing ? 'bg-indigo-600' : 'bg-[#E91E63]'} text-white w-9 h-9 rounded-[14px] flex items-center justify-center font-black shadow-xl border-2 border-white transition-all duration-300 text-sm">
          ${number}
        </div>
        <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] ${isEditing ? 'border-t-indigo-600' : 'border-t-[#E91E63]'} -mt-1"></div>
      </div>
    `,
    iconSize: [36, 46],
    iconAnchor: [18, 46]
  });
};

const MapController: React.FC<{ target?: [number, number] }> = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      const currentZoom = map.getZoom();
      const targetZoom = currentZoom < 14 ? 16 : currentZoom;
      map.setView(target, targetZoom, { animate: true });
    }
  }, [target, map]);
  return null;
};

// Componente para capturar o centro do mapa para o botão "+"
const CenterMarkerHandler: React.FC<{ onAddAtCenter: (lat: number, lng: number) => void }> = ({ onAddAtCenter }) => {
  const map = useMap();
  
  useEffect(() => {
    (window as any).addPointAtMapCenter = () => {
      const center = map.getCenter();
      onAddAtCenter(center.lat, center.lng);
    };
  }, [map, onAddAtCenter]);

  return null;
};

const App: React.FC = () => {
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapTarget, setMapTarget] = useState<[number, number] | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'zones' | 'history' | 'social'>('social');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSatellite, setIsSatellite] = useState(false);
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [newPointData, setNewPointData] = useState<Partial<GeoPoint>>({ name: '', radius: 100, link: '', exitLink: '' });
  const [isCopied, setIsCopied] = useState(false);
  const [activeNotification, setActiveNotification] = useState<{title: string, body: string, type: 'trigger' | 'info' | 'error'} | null>(null);
  const [mapKey, setMapKey] = useState(0); 
  const [confirmDialog, setConfirmDialog] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

  const [myId] = useState(() => localStorage.getItem('geolink_my_id') || crypto.randomUUID());
  const [myName, setMyName] = useState(() => localStorage.getItem('geolink_my_name') || 'Eu');
  const [myColor, setMyColor] = useState(() => localStorage.getItem('geolink_my_color') || '#6366F1');
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('geolink_room_code') || '');
  const [remoteUsers, setRemoteUsers] = useState<Record<string, RemoteUser>>({});
  const [syncStatus, setSyncStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const ws = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevInsideStatus = useRef<Record<string, boolean>>({});
  const hasInitiallyCentered = useRef(false);
  const isLoaded = useRef(false);

  // Persistence
  useEffect(() => {
    const savedPoints = localStorage.getItem('geolink_points_v21');
    const savedLogs = localStorage.getItem('geolink_logs_v21');
    const savedTheme = localStorage.getItem('geolink_map_theme');
    
    if (savedPoints) {
      try {
        setPoints(JSON.parse(savedPoints));
      } catch (e) {
        console.error("Failed to parse saved points", e);
      }
    }
    if (savedLogs) setLogs(JSON.parse(savedLogs));
    if (savedTheme) setMapTheme(savedTheme as 'light' | 'dark');
    
    isLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!isLoaded.current) return;
    localStorage.setItem('geolink_points_v21', JSON.stringify(points));
    localStorage.setItem('geolink_logs_v21', JSON.stringify(logs));
    localStorage.setItem('geolink_map_theme', mapTheme);
    localStorage.setItem('geolink_my_id', myId);
    localStorage.setItem('geolink_my_name', myName);
    localStorage.setItem('geolink_my_color', myColor);
    localStorage.setItem('geolink_room_code', roomCode);
  }, [points, logs, mapTheme, myName, myColor, roomCode, myId]);

  // Sync Logic
  useEffect(() => {
    if (!roomCode || roomCode.length < 3) {
      if (ws.current) ws.current.close();
      setRemoteUsers({});
      setSyncStatus('disconnected');
      return;
    }

    const connect = () => {
      setSyncStatus('connecting');
      const socket = new WebSocket('wss://socketsbay.com/wss/v2/1/demo/');
      socket.onopen = () => setSyncStatus('connected');
      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.room === roomCode && data.userId !== myId) {
            setRemoteUsers(prev => ({ ...prev, [data.userId]: { ...data, lastSeen: Date.now() } }));
          }
        } catch {}
      };
      socket.onclose = () => {
        setSyncStatus('disconnected');
        if (roomCode.length >= 3) {
          setTimeout(connect, 10000);
        }
      };
      ws.current = socket;
    };

    connect();
    return () => ws.current?.close();
  }, [roomCode, myId]);

  useEffect(() => {
    if (syncStatus === 'connected' && userLocation && roomCode) {
      const interval = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current?.send(JSON.stringify({
            room: roomCode, userId: myId, userName: myName, userColor: myColor,
            lat: userLocation.lat, lng: userLocation.lng
          }));
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [syncStatus, userLocation, roomCode, myId, myName, myColor]);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude, accuracy });
        if (!hasInitiallyCentered.current) {
          setMapTarget([latitude, longitude]);
          hasInitiallyCentered.current = true;
        }
      },
      (err) => {
        console.error(err);
        setUserLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Fencing Logic
  useEffect(() => {
    if (!userLocation || points.length === 0) return;
    points.forEach((point) => {
      const dist = calculateDistance(userLocation.lat, userLocation.lng, point.lat, point.lng);
      const isInside = dist <= point.radius;
      const wasInside = prevInsideStatus.current[point.id] || false;

      if (isInside && !wasInside) {
        if (point.link) fetch(point.link, { mode: 'no-cors' }).catch(() => {});
        addLog(point.name, 'entry');
        showVisualAlert(`ENTROU: ${point.name}`, 'trigger');
      } else if (!isInside && wasInside) {
        if (point.exitLink) fetch(point.exitLink, { mode: 'no-cors' }).catch(() => {});
        addLog(point.name, 'exit');
        showVisualAlert(`SAIU: ${point.name}`, 'info');
      }
      prevInsideStatus.current[point.id] = isInside;
    });
  }, [userLocation, points]);

  const addLog = (name: string, type: 'entry' | 'exit') => {
    setLogs(prev => [{ id: crypto.randomUUID(), pointName: name, type, timestamp: Date.now() }, ...prev].slice(0, 50));
  };

  const showVisualAlert = (body: string, type: 'trigger' | 'info' | 'error') => {
    setActiveNotification({ title: type === 'trigger' ? 'MAPA' : (type === 'error' ? 'ERRO' : 'INFO'), body, type });
    setTimeout(() => setActiveNotification(null), 4000);
  };

  const handleExport = () => {
    if (points.length === 0) {
      showVisualAlert('Não há pontos para exportar', 'info');
      return;
    }
    const dataStr = JSON.stringify(points, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `geolink-backup-${new Date().toISOString().slice(0,10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        
        if (Array.isArray(json) && json.length > 0) {
          const isValid = json.every(p => p.lat !== undefined && p.lng !== undefined && p.name !== undefined);
          
          if (isValid) {
            setConfirmDialog({
              title: 'Restaurar Backup',
              message: `Isso substituirá seus ${points.length} locais atuais por ${json.length} locais do arquivo.`,
              onConfirm: () => {
                setPoints(json);
                setMapKey(prev => prev + 1);
                showVisualAlert(`${json.length} locais restaurados!`, 'info');
                setIsSidebarOpen(false);
                setConfirmDialog(null);
              }
            });
          } else {
            showVisualAlert('Formato de backup inválido', 'error');
          }
        } else {
          showVisualAlert('Backup vazio ou corrompido', 'error');
        }
      } catch (err) {
        showVisualAlert('Erro ao ler arquivo JSON', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const openNewPointModal = (lat: number, lng: number) => {
    setEditingPointId('new-point'); 
    setNewPointData({ name: '', radius: 100, link: '', exitLink: '', lat, lng }); 
    setIsModalOpen(true); 
  };

  const savePoint = () => {
    if (newPointData.lat === undefined || newPointData.lng === undefined) return;
    
    const finalName = (newPointData.name || '').trim() || `Local ${points.length + 1}`;
    
    setPoints(prev => {
      if (editingPointId && editingPointId !== 'new-point') {
        return prev.map(p => p.id === editingPointId ? { ...p, ...newPointData, name: finalName } as GeoPoint : p);
      } else {
        const newPoint: GeoPoint = {
          id: crypto.randomUUID(),
          name: finalName,
          lat: newPointData.lat!,
          lng: newPointData.lng!,
          radius: newPointData.radius || 100,
          link: newPointData.link || '',
          exitLink: newPointData.exitLink || '',
          isActive: true
        };
        return [...prev, newPoint];
      }
    });

    setIsModalOpen(false);
    setEditingPointId(null);
    setNewPointData({ name: '', radius: 100, link: '', exitLink: '' });
  };

  const deletePoint = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
    setMapKey(k => k + 1);
  };

  const totalOnlineCount = Object.keys(remoteUsers).length + (syncStatus === 'connected' ? 1 : 0);

  return (
    <div className={`relative h-screen w-full font-sans overflow-hidden transition-colors duration-500 ${mapTheme === 'dark' ? 'bg-[#0F172A]' : 'bg-[#F1F5F9]'}`}>
      
      <input type="file" ref={fileInputRef} onChange={handleImport} accept="application/json,.json" className="hidden" />

      {/* Menu Button */}
      <button onClick={() => setIsSidebarOpen(true)} className={`absolute top-10 left-8 z-[1000] w-14 h-14 flex items-center justify-center rounded-[22px] shadow-3xl active:scale-90 transition-all border ${mapTheme === 'dark' ? 'bg-[#1E293B] text-white border-white/10' : 'bg-white text-slate-900 border-slate-200'}`}>
        <Menu size={28} />
      </button>

      {/* Sidebar Overlay */}
      <div className={`fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
      
      {/* Sidebar Aside */}
      <aside className={`fixed top-0 left-0 h-full w-[88vw] max-w-[380px] z-[2001] transition-transform flex flex-col rounded-r-[40px] shadow-4xl ${mapTheme === 'dark' ? 'bg-[#1E293B] text-white' : 'bg-white text-slate-900'} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 pt-16 flex flex-col gap-1 shrink-0">
          <h1 className="text-3xl font-black tracking-tighter uppercase italic">GeoLink <span className="text-indigo-500">Família</span></h1>
          
          <div className="flex flex-col gap-1.5 mt-4 p-4 rounded-3xl bg-black/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi size={14} className={syncStatus === 'connected' ? 'text-emerald-500' : (roomCode.length < 3 ? 'text-slate-400' : 'text-rose-500')} />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Rede da Família</p>
              </div>
              <div className="flex items-center gap-1.5">
                <p className={`text-[10px] font-bold uppercase ${syncStatus === 'connected' ? 'text-emerald-500' : (syncStatus === 'connecting' ? 'text-amber-500' : (roomCode.length < 3 ? 'text-slate-400' : 'text-rose-500'))}`}>
                  {syncStatus === 'connected' ? 'Sincronizado' : (syncStatus === 'connecting' ? 'Conectando...' : (roomCode.length < 3 ? 'Sem Sala' : 'Offline'))}
                </p>
                <div className={`w-2 h-2 rounded-full ${syncStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : (syncStatus === 'connecting' ? 'bg-amber-500 animate-bounce' : 'bg-rose-500')}`} />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Navigation size={14} className={userLocation ? 'text-emerald-500' : 'text-rose-500'} />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Precisão GPS</p>
              </div>
              <div className="flex items-center gap-1.5">
                <p className={`text-[10px] font-bold uppercase ${userLocation ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {userLocation ? `${userLocation.accuracy.toFixed(0)}m` : 'Localizando...'}
                </p>
                <div className={`w-2 h-2 rounded-full ${userLocation ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              </div>
            </div>
          </div>
          
          <button onClick={() => setIsSidebarOpen(false)} className={`absolute top-10 right-8 w-10 h-10 rounded-full flex items-center justify-center ${mapTheme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}><X size={20}/></button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 flex gap-2 mb-6 shrink-0">
          <button onClick={() => setSidebarTab('social')} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all ${sidebarTab === 'social' ? 'bg-emerald-600 text-white shadow-lg' : (mapTheme === 'dark' ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
            <Users size={18}/><span className="text-[9px] font-black uppercase mt-1">Pessoas</span>
          </button>
          <button onClick={() => setSidebarTab('zones')} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all ${sidebarTab === 'zones' ? 'bg-indigo-600 text-white shadow-lg' : (mapTheme === 'dark' ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
            <MapIcon size={18}/><span className="text-[9px] font-black uppercase mt-1">Zonas</span>
          </button>
          <button onClick={() => setSidebarTab('history')} className={`flex-1 flex flex-col items-center py-4 rounded-2xl transition-all ${sidebarTab === 'history' ? 'bg-amber-600 text-white shadow-lg' : (mapTheme === 'dark' ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
            <RefreshCw size={18}/><span className="text-[9px] font-black uppercase mt-1">Logs</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-12 scrollbar-hide">
          {sidebarTab === 'social' ? (
            <div className="space-y-6">
              <div className={`p-6 rounded-3xl space-y-4 shadow-sm border ${mapTheme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sua Identidade</p>
                  {syncStatus === 'connected' && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-full">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">Transmitindo</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div style={{backgroundColor: myColor}} className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xl border-4 border-white/20 shrink-0">
                    {myName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input type="text" value={myName} onChange={(e) => setMyName(e.target.value)} className="w-full bg-transparent border-b border-indigo-500/30 font-bold outline-none text-sm p-1" placeholder="Seu nome..." />
                    <div className="flex gap-2">
                      {['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#EF4444'].map(c => (
                        <button key={c} onClick={() => setMyColor(c)} style={{backgroundColor: c}} className={`w-6 h-6 rounded-full border-2 transition-transform ${myColor === c ? 'border-white scale-125 z-10' : 'border-transparent opacity-50'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-3xl space-y-4 shadow-sm ${mapTheme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Código da Família</p>
                  <Info size={14} className={syncStatus === 'connected' ? 'text-emerald-500' : 'text-indigo-500'} />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="Ex: familia2024" className={`flex-1 p-4 rounded-xl text-xs font-black outline-none border transition-all ${mapTheme === 'dark' ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-900'}`} />
                  <button onClick={() => { navigator.clipboard.writeText(roomCode); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} className={`p-4 rounded-xl transition-all active:scale-95 ${isCopied ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {isCopied ? <Check size={18}/> : <Copy size={18}/>}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Membros Online ({totalOnlineCount})</p>
                
                {syncStatus === 'connected' && (
                  <div onClick={() => { userLocation && setMapTarget([userLocation.lat, userLocation.lng]); setIsSidebarOpen(false); }} className={`p-4 rounded-2xl flex items-center gap-4 cursor-pointer active:scale-95 transition-all shadow-sm border-2 ${mapTheme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100'}`}>
                    <div style={{backgroundColor: myColor}} className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm border-2 border-white/20">
                      {myName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-xs uppercase tracking-tight">{myName}</p>
                        <span className="text-[7px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded-md leading-none">VOCÊ</span>
                      </div>
                      <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest leading-tight">Sinal transmitindo</p>
                    </div>
                    <Radio size={16} className="text-indigo-500 animate-pulse" />
                  </div>
                )}

                {(Object.values(remoteUsers) as RemoteUser[]).map((user: RemoteUser) => (
                  <div key={user.id} onClick={() => { setMapTarget([user.lat, user.lng]); setIsSidebarOpen(false); }} className={`p-4 rounded-2xl flex items-center gap-4 cursor-pointer active:scale-95 transition-all shadow-sm ${mapTheme === 'dark' ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 border border-slate-100 hover:bg-slate-100'}`}>
                    <div style={{backgroundColor: user.color}} className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm border-2 border-white/20">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-xs uppercase tracking-tight">{user.name}</p>
                      <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Ativo no Mapa</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          ) : sidebarTab === 'zones' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleExport} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95 ${mapTheme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 shadow-sm'}`}>
                  <Download size={18} className="text-indigo-500 mb-1" />
                  <span className="text-[9px] font-black uppercase opacity-60">Backup</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95 ${mapTheme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 shadow-sm'}`}>
                  <Upload size={18} className="text-indigo-500 mb-1" />
                  <span className="text-[9px] font-black uppercase opacity-60">Restaurar</span>
                </button>
              </div>

              <div className="space-y-4">
                {points.map((p, i) => (
                  <div key={p.id} onClick={() => { setMapTarget([p.lat, p.lng]); setIsSidebarOpen(false); }} className={`p-4 border rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer ${mapTheme === 'dark' ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                    <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-xs shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate uppercase tracking-tight">{p.name}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">{p.radius}m • {p.exitLink ? 'E/S' : 'E'}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingPointId(p.id); setNewPointData({...p}); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-500"><Edit3 size={16}/></button>
                      <button onClick={(e) => { 
                        e.stopPropagation(); 
                        setConfirmDialog({
                          title: 'Apagar Local',
                          message: `Deseja realmente excluir "${p.name}"?`,
                          onConfirm: () => { deletePoint(p.id); setConfirmDialog(null); }
                        });
                      }} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
                {points.length === 0 && (
                  <div className="text-center py-10 px-6 space-y-4 opacity-40">
                    <MapIcon size={32} className="mx-auto" />
                    <p className="text-[10px] uppercase font-black text-slate-500 italic leading-relaxed">Clique no botão "+" no mapa para marcar uma nova zona</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map(log => (
                <div key={log.id} className={`p-4 rounded-2xl flex items-center gap-4 ${mapTheme === 'dark' ? 'bg-white/5' : 'bg-slate-50 border border-slate-100'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${log.type === 'entry' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
                    {log.type === 'entry' ? <ArrowRightCircle size={18}/> : <ArrowLeftCircle size={18}/>}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs uppercase truncate">{log.pointName}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{log.type === 'entry' ? 'Entrou' : 'Saiu'} • {new Date(log.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-8 border-t border-white/5 flex items-center justify-between shrink-0">
           <span className="text-[10px] font-black uppercase text-slate-500 opacity-50 italic tracking-tighter">GeoLink Tracker v2.1</span>
           <button onClick={() => { 
             setConfirmDialog({
               title: 'Limpar Banco',
               message: 'Isso apagará permanentemente todos os seus locais configurados.',
               onConfirm: () => { setPoints([]); setMapKey(k => k + 1); setConfirmDialog(null); }
             });
           }} className="text-rose-500/60 p-2 hover:bg-rose-500/10 rounded-lg transition-all"><Eraser size={18} /></button>
        </div>
      </aside>

      {/* Main Map Content */}
      <main className="w-full h-full relative">
        <div className="absolute top-10 right-8 z-[1000] flex flex-col gap-4">
          <button onClick={() => { userLocation && setMapTarget([userLocation.lat, userLocation.lng]); }} className="w-14 h-14 bg-indigo-600 text-white flex items-center justify-center rounded-[22px] shadow-4xl active:scale-90 shadow-indigo-600/20"><LocateFixed size={28} /></button>
          
          <div className={`flex flex-col gap-2 p-1 border rounded-[26px] shadow-4xl ${mapTheme === 'dark' ? 'bg-[#1E293B] border-white/10' : 'bg-white border-slate-200'}`}>
            <button onClick={() => (window as any).addPointAtMapCenter?.()} className={`w-12 h-12 flex items-center justify-center rounded-[20px] transition-all text-indigo-500 hover:bg-indigo-500/10`}>
              <Plus size={24} />
            </button>
            <div className={`h-px w-8 mx-auto ${mapTheme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`} />
            <button onClick={() => setIsSatellite(!isSatellite)} className={`w-12 h-12 flex items-center justify-center rounded-[20px] transition-all ${isSatellite ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-indigo-500'}`}><Layers size={22} /></button>
            <button onClick={() => setMapTheme(mapTheme === 'dark' ? 'light' : 'dark')} className={`w-12 h-12 flex items-center justify-center rounded-[20px] transition-all ${!isSatellite ? 'text-indigo-400' : 'text-slate-300 cursor-not-allowed'}`} disabled={isSatellite}>
              {mapTheme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            </button>
          </div>
        </div>

        <MapContainer key={mapKey} center={[-23.5505, -46.6333]} zoom={15} zoomControl={false} className="w-full h-full">
          <TileLayer 
            url={isSatellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : (mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png")}
            attribution='&copy; OpenStreetMap'
          />
          <CenterMarkerHandler onAddAtCenter={openNewPointModal} />
          <MapController target={mapTarget} />
          {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />}
          {(Object.values(remoteUsers) as RemoteUser[]).map((user: RemoteUser) => (
            <Marker key={user.id} position={[user.lat, user.lng]} icon={createRemoteUserIcon(user.color, user.name)}>
              <Tooltip direction="top" offset={[0, -52]} opacity={1} permanent className="custom-tooltip">
                <div className="font-black text-[10px] uppercase tracking-tight">{user.name}</div>
              </Tooltip>
            </Marker>
          ))}
          {points.map((p, i) => (
            <React.Fragment key={p.id}>
              <Marker position={[p.lat, p.lng]} icon={createNumberedIcon(i + 1, editingPointId === p.id)} draggable={true} eventHandlers={{ dragend: (e) => {
                const newLatLng = (e.target as L.Marker).getLatLng();
                setPoints(prev => prev.map(pt => pt.id === p.id ? { ...pt, lat: newLatLng.lat, lng: newLatLng.lng } : pt));
              }}} />
              <Circle center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: '#6366F1', fillOpacity: 0.1, weight: 2, dashArray: '5, 10' }} />
            </React.Fragment>
          ))}
        </MapContainer>
      </main>

      {/* Custom Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in zoom-in duration-200">
          <div className={`w-full max-w-sm rounded-[40px] p-10 text-center space-y-6 shadow-4xl ${mapTheme === 'dark' ? 'bg-[#1E293B] text-white' : 'bg-white text-slate-900'}`}>
            <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-2">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black uppercase tracking-tighter italic">{confirmDialog.title}</h3>
              <p className="text-sm opacity-60 font-medium leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDialog.onConfirm} className="w-full h-16 bg-rose-600 text-white font-black rounded-3xl text-xs uppercase tracking-widest shadow-lg shadow-rose-600/20">CONFIRMAR</button>
              <button onClick={() => setConfirmDialog(null)} className={`w-full h-14 font-black rounded-3xl text-[10px] uppercase tracking-widest ${mapTheme === 'dark' ? 'bg-white/5 text-white/40' : 'bg-slate-100 text-slate-400'}`}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Point Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-6">
          <div className={`rounded-t-[40px] sm:rounded-[40px] w-full max-w-lg overflow-hidden shadow-4xl border-t transition-colors animate-in slide-in-from-bottom ${mapTheme === 'dark' ? 'bg-[#1E293B] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="px-10 pt-10 pb-4 flex justify-between items-center">
              <h2 className="text-2xl font-black tracking-tighter uppercase">{editingPointId === 'new-point' ? 'Novo Ponto' : 'Editar'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-500/10"><X size={20}/></button>
            </div>
            <div className="px-10 pb-12 space-y-6">
              <input type="text" value={newPointData.name} onChange={(e) => setNewPointData({ ...newPointData, name: e.target.value })} placeholder="Nome (Ex: Casa)" className={`w-full p-5 border rounded-2xl font-bold text-lg outline-none transition-all ${mapTheme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`} />
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase px-1">MacroDroid Entrada (Indigo)</label>
                  <input type="text" value={newPointData.link} onChange={(e) => setNewPointData({ ...newPointData, link: e.target.value })} placeholder="Link de entrada..." className={`w-full p-4 border rounded-xl text-xs outline-none ${mapTheme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase px-1">MacroDroid Saída (Âmbar)</label>
                  <input type="text" value={newPointData.exitLink} onChange={(e) => setNewPointData({ ...newPointData, exitLink: e.target.value })} placeholder="Link de saída..." className={`w-full p-4 border rounded-xl text-xs outline-none ${mapTheme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`} />
                </div>
              </div>
              <div className="flex justify-between items-end px-2">
                <label className="text-[9px] font-black text-slate-500 uppercase">Raio da Cerca</label>
                <span className="text-xl font-black text-indigo-500">{newPointData.radius}m</span>
              </div>
              <input type="range" min="30" max="1000" step="10" value={newPointData.radius} onChange={(e) => setNewPointData({ ...newPointData, radius: parseInt(e.target.value) })} className="w-full h-1.5 bg-indigo-500/20 rounded-full appearance-none accent-indigo-500 cursor-pointer" />
              <button onClick={savePoint} className="w-full h-16 bg-indigo-600 text-white font-black rounded-[24px] text-xs uppercase tracking-[3px] shadow-xl shadow-indigo-600/20">SALVAR LOCAL</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Notifications */}
      {activeNotification && (
        <div className="fixed top-8 left-6 right-6 z-[4000] animate-in slide-in-from-top">
          <div className={`max-w-xs mx-auto ${activeNotification.type === 'trigger' ? 'bg-emerald-600' : (activeNotification.type === 'error' ? 'bg-rose-600' : 'bg-indigo-600')} text-white rounded-[32px] p-5 shadow-4xl flex items-center gap-4`}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-black text-lg shrink-0">
              {activeNotification.type === 'error' ? <AlertCircle size={20}/> : <MapIcon size={20}/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black opacity-60 uppercase tracking-widest mb-0.5">{activeNotification.title}</p>
              <h4 className="font-bold text-sm truncate uppercase">{activeNotification.body}</h4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
