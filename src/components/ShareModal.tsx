import React from 'react';
import './ShareModal.css';

interface ShareModalProps {
  url: string;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ url, onClose }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('Посилання скопійовано!');
    } catch (err) {
      console.error('Помилка копіювання:', err);
    }
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation(); // Щоб не спрацьовував onClick на фоні
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={stopPropagation}>
        <h3 className="share-title">Поділитися</h3>

        <div className="share-buttons">
          <a
            className="share-btn"
            href={`https://t.me/share/url?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Telegram
          </a>
          <a
            className="share-btn"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>
          <a
            className="share-btn"
            href={`https://www.instagram.com/?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
          <a
            className="share-btn"
            href={`https://www.tiktok.com/upload?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            TikTok
          </a>

          <button className="share-btn" onClick={handleCopy}>
            Скопіювати посилання
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
