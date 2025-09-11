/* 📄 src/components/StoryBar.css — новий стиль сторісбару з великими кружечками */

.story-bar {
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 12px 8px;
  gap: 12px;
  background: #ffffff;
  border-bottom: 1px solid #ddd;
  height: 120px;
  scroll-behavior: smooth;
}

.story-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 84px;
  flex: 0 0 auto;
  cursor: pointer;
}

.story-circle {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  border: 3px solid #8cd3e9;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s ease;
}

.story-circle:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.story-label {
  font-size: 13px;
  margin-top: 6px;
  text-align: center;
  color: #333;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 80px;
  overflow: hidden;
}

.add-button .story-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  background: linear-gradient(135deg, #8cd3e9, #90caf9);
  border: none;
}

.add-button .story-circle:hover {
  transform: scale(1.1);
  background: linear-gradient(135deg, #64b5f6, #4fc3f7);
}
