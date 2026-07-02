import logo from './assets/images/logo-universal.png';
import './App.css';

function App() {
    return (
        <div id="App">
            <img src={logo} id="logo" alt="logo"/>
            <div id="result" className="result">mqtt-insight</div>
        </div>
    )
}

export default App
