import React, {useState} from 'react';

const NoteTaking = () => {
    const [note, setNote] = useState('');

    const handleChange = (event) => {
        setNote(event.target.value);
    };

    return (
        <div>
      <textarea
          value={note}
          onChange={handleChange}
          placeholder="Type your notes here..."
          style={{width: '100%', height: '150px', padding: '10px', fontSize: '16px'}}
      />
        </div>
    );
};

export default NoteTaking;
