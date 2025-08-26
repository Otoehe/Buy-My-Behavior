// roles.ts

export interface Role {
  name: string;
  color: string;
}

export const roles: Role[] = [
  { name: 'Актор', color: '#F089f7' },
  { name: 'Музикант', color: '#4fc3f7' },
  { name: 'Авантюрист', color: '#a5d6a7' },
  { name: 'Ескорт', color: '#ff8a65' },
  { name: 'Хейтер', color: '#ffcc80' },
  { name: 'Танцівник', color: '#ba68c8' },
  { name: 'Бодібілдер', color: '#81c784' },
  { name: 'Філософ', color: '#90a4ae' },
  { name: 'Відчайдух', color: '#f48fb1' },
  { name: 'Репортер', color: '#7986cb' },
  { name: 'Пранкер', color: '#ffb74d' },
  { name: 'Офіціант', color: '#ce93d8' },
  { name: 'Політик', color: '#64b5f6' },
  { name: 'Інфлюенсер', color: '#aed581' },
  { name: 'Блогер', color: '#f4a261' },
  { name: 'Інша', color: '#cfd8dc' } // Власна роль
];
