import {ComponentPreview, Previews} from "@react-buddy/ide-toolbox";
import {PaletteTree} from "./palette";
import Home from "../Home.tsx";
import Attendance from "../Attendance.tsx";

const ComponentPreviews = () => {
    return (
        <Previews palette={<PaletteTree/>}>
            <ComponentPreview path="/Home">
                <Home/>
            </ComponentPreview>
            <ComponentPreview path="/Attendance">
                <Attendance/>
            </ComponentPreview>
        </Previews>
    );
};

export default ComponentPreviews;