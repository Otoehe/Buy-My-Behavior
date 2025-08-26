import React from 'react';

const RoleFilter: React.FC = () => {
  return (
    <div className="absolute top-4 right-4 z-10">
      <select className="border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300">
        <option value="">Усі ролі</option>
        <option value="actor">Актори</option>
        <option value="musician">Музиканти</option>
        <option value="adventurer">Авантюристи</option>
        <option value="escort">Ескорт</option>
      </select>
    </div>
  );
};

export default RoleFilter;
