type Position=Readonly<{left:number;top:number}>;
type Size=Readonly<{width:number;height:number}>;

/** Viewport avoidance must not replace the position chosen by the viewer. */
export class PanelPlacement {
  private preferred:Position|undefined;
  get moved() {return this.preferred!==undefined;}
  move(position:Position,size:Size,viewport:Size):Position {
    this.preferred=this.fit(position,size,viewport);
    return this.preferred;
  }
  layout(anchor:Position,size:Size,viewport:Size):Position {
    return this.fit(this.preferred??anchor,size,viewport);
  }
  private fit(position:Position,size:Size,viewport:Size):Position {
    return {
      left:Math.max(12,Math.min(viewport.width-size.width-12,position.left)),
      top:Math.max(100,Math.min(viewport.height-size.height-98,position.top)),
    };
  }
}
