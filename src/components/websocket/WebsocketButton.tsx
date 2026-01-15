import { useEffect, useState, useRef } from 'react';

const WebSocketTest = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Déconnecté');
  
  // On utilise une ref pour garder la même instance de socket entre les rendus
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connexion au serveur Rocket
    const socket = new WebSocket('ws://localhost:8000/echo');
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('Connecté au serveur Rocket');
    };

    socket.onmessage = (event) => {
      setMessages((prev) => [...prev, `Serveur dit: ${event.data}`]);
    };

    socket.onclose = () => {
      setStatus('Déconnecté');
    };

    socket.onerror = (error) => {
      console.error('Erreur WebSocket:', error);
      setStatus('Erreur de connexion');
    };

    // Nettoyage : ferme la socket quand on quitte la page
    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(input);
      setMessages((prev) => [...prev, `Moi: ${input}`]);
      setInput('');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Statut: {status}</h2>
      
      <div style={{ border: '1px solid #ccc', height: '200px', overflowY: 'scroll', marginBottom: '10px', padding: '10px' }}>
        {messages.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
      </div>

      <input 
        value={input} 
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        placeholder="Tapez un message..."
      />
      <button onClick={sendMessage}>Envoyer</button>
    </div>
  );
};

export default WebSocketTest;