const React = require('react');
let RN;
try {
  RN = require('react-native');
  if (RN.Platform.OS === 'web') {
    RN = require('react-native-web');
  }
} catch (e) {
  RN = require('react-native-web');
}
if (!RN) {
  throw new Error('failed to import react-native(-web)');
}

const RNSVG = require('react-native-svg');

const { View, PanResponder, Platform } = RN;
const { Component } = React;
const { Svg } = RNSVG;

const isMacOS = (() => {
  if (!window || !window.navigator || typeof window.navigator.platform != 'string') {
    return false;
  }

  return window.navigator.platform.indexOf('Mac') == 0;
})(); 

const DEFAULT_SCROLL_FACTOR = isMacOS ? 1.03 : 1.2;

// Based on https://gist.github.com/evgen3188/db996abf89e2105c35091a3807b7311d

function calcDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function middle(p1, p2) {
  return (p1 + p2) / 2;
}

function calcCenter(x1, y1, x2, y2) {
  return {
    x: middle(x1, x2),
    y: middle(y1, y2),
  };
}

function getAlignment(align) {
  switch (align) {
    case 'min':
    case 'start':
      return 'xMinYMin';

    case 'mid':
      return 'xMidYMid';

    case 'max':
    case 'end':
      return 'xMaxYMax';

    default:
      return align || 'xMidYMid';
  }
}

function serializeTransform(transform) {
  return `translate(${transform.translateX} ${transform.translateY}) ` + 
    `scale(${transform.scaleX} ${transform.scaleY})`;
}

function getTransform(viewBoxRect, eRect, align, meetOrSlice) {
  // based on https://svgwg.org/svg2-draft/coords.html#ComputingAViewportsTransform

  // Let vb-x, vb-y, vb-width, vb-height be the min-x, min-y, width and height values of the viewBox attribute respectively.
  const vbX = viewBoxRect.left || 0;
  const vbY = viewBoxRect.top || 0;
  const viewBoxWidth = viewBoxRect.width;
  const viewBoxHeight = viewBoxRect.height;

  // Let e-x, e-y, e-width, e-height be the position and size of the element respectively.
  const eX = eRect.left || 0;
  const eY = eRect.top || 0;
  const eWidth = eRect.width;
  const eHeight = eRect.height;

  // Initialize scale-x to e-width/vb-width.
  let scaleX = eWidth / viewBoxWidth;

  // Initialize scale-y to e-height/vb-height.
  let scaleY = eHeight / viewBoxHeight;

  // Initialize translate-x to e-x - (vb-x * scale-x).
  // Initialize translate-y to e-y - (vb-y * scale-y).
  let translateX = eX - vbX * scaleX;
  let translateY = eY - vbY * scaleY;

  // If align is 'none'
  if (align === 'none') {
    // Let scale be set the smaller value of scale-x and scale-y.
    // Assign scale-x and scale-y to scale.
    const scale = (scaleX = scaleY = Math.min(scaleX, scaleY));

    // If scale is greater than 1
    if (scale > 1) {
      // Minus translateX by (eWidth / scale - viewBoxWidth) / 2
      // Minus translateY by (eHeight / scale - viewBoxHeight) / 2
      translateX -= (eWidth / scale - viewBoxWidth) / 2;
      translateY -= (eHeight / scale - viewBoxHeight) / 2;
    } else {
      translateX -= (eWidth - viewBoxWidth * scale) / 2;
      translateY -= (eHeight - viewBoxHeight * scale) / 2;
    }
  } else {
    // If align is not 'none' and meetOrSlice is 'meet', set the larger of scale-x and scale-y to the smaller.
    // Otherwise, if align is not 'none' and meetOrSlice is 'slice', set the smaller of scale-x and scale-y to the larger.

    if (align !== 'none' && meetOrSlice === 'meet') {
      scaleX = scaleY = Math.min(scaleX, scaleY);
    } else if (align !== 'none' && meetOrSlice === 'slice') {
      scaleX = scaleY = Math.max(scaleX, scaleY);
    }

    // If align contains 'xMid', add (e-width - vb-width * scale-x) / 2 to translate-x.
    if (align.includes('xMid')) {
      translateX += (eWidth - viewBoxWidth * scaleX) / 2;
    }

    // If align contains 'xMax', add (e-width - vb-width * scale-x) to translate-x.
    if (align.includes('xMax')) {
      translateX += eWidth - viewBoxWidth * scaleX;
    }

    // If align contains 'yMid', add (e-height - vb-height * scale-y) / 2 to translate-y.
    if (align.includes('YMid')) {
      translateY += (eHeight - viewBoxHeight * scaleY) / 2;
    }

    // If align contains 'yMax', add (e-height - vb-height * scale-y) to translate-y.
    if (align.includes('YMax')) {
      translateY += eHeight - viewBoxHeight * scaleY;
    }
  }

  // The transform applied to content contained by the element is given by
  // translate(translate-x, translate-y) scale(scale-x, scale-y).
  return { translateX, translateY, scaleX, scaleY, eRect };
}

function getConstraints(props, viewBox) {
  const { constrain } = props;
  if (!constrain) {
    return null;
  }

  // Constraints
  const {
    combine = 'dynamic',
    scaleExtent = [0, Infinity],
    translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]],
  } = constrain;

  const [minZoom = 0, maxZoom = Infinity] = scaleExtent;

  const [
    min = [-Infinity, -Infinity],
    max = [Infinity, Infinity],
  ] = translateExtent;

  const [minX = -Infinity, minY = -Infinity] = min;
  const [maxX = Infinity, maxY = Infinity] = max;

  // Extent of constraints
  const ew = maxX - minX;
  const eh = maxY - minY;

  const { scaleX, scaleY, eRect: { width, height } } = viewBox;

  // Size of canvas in viewbox
  const vw = width / scaleX;
  const vh = height / scaleY;

  switch (combine) {
    default:
    case 'dynamic': {
      return {
        dynamic: [ew, eh],
        scaleExtent: [minZoom, maxZoom],
        translateExtent: [[minX, minY], [maxX, maxY]],
      };
    }
    case 'static': {
      return {
        dynamic: null,
        scaleExtent: [minZoom, maxZoom],
        translateExtent: [[minX, minY], [maxX, maxY]],
      };
    }
    case 'union': {
      // Max extent (at minZoom)
      const maxW = vw / minZoom;
      const maxH = vh / minZoom;

      // Amount of free space when zoomed out beyond a translateExtent
      const fx = Math.max(0, maxW - ew);
      const fy = Math.max(0, maxH - eh);

      // Union of constraints
      return {
        dynamic: null,
        scaleExtent: [minZoom, maxZoom],
        translateExtent: [[minX - fx, minY - fy], [maxX + fx, maxY + fy]],
      };
    }
    case 'intersect': {
      // Zoom which shows entire extent
      const wZoom = vw / ew;
      const hZoom = vh / eh;

      // Intersection of constraints
      const minAllowedZoom = Math.max(wZoom, hZoom, minZoom);

      return {
        dynamic: null,
        scaleExtent: [minAllowedZoom, maxZoom],
        translateExtent: [[minX, minY], [maxX, maxY]],
      };
    }
  }
}

function nodeHasParent(node, otherNode) {
  while (node) {
    if (node == otherNode) return true;
    node = node.parentElement;
  }

  return false;
}

function getInitialStateFromProps(props, state) {
  const {
    top,
    left,
    zoom,
    align,
    width,
    height,
    viewBoxWidth,
    viewBoxHeight,
    meetOrSlice = 'meet',
    eRect = { width, height },
    viewBoxRect = { width: viewBoxWidth || width, height: viewBoxHeight || height },
  } = props;
  const { top: currTop, left: currLeft, zoom: currZoom } = state;
  const viewBox = getTransform(viewBoxRect, eRect, getAlignment(align), meetOrSlice);
  return {
    constraints: getConstraints(props, viewBox),
    top: top || currTop,
    left: left || currLeft,
    zoom: zoom || currZoom,
    ...viewBox,
  };
}

function getZoomTransform({
  left,
  top,
  zoom,
  scaleX,
  scaleY,
  translateX,
  translateY,
}) {
  return {
    translateX: left + zoom * translateX,
    translateY: top + zoom * translateY,
    scaleX: zoom * scaleX,
    scaleY: zoom * scaleY,
  };
}

const ZoomableSvg = React.forwardRef((props, zoomableSvgRef) => {
  const initialState = getInitialStateFromProps(props, {
    zoom: props.zoom || props.initialZoom || 1,
    left: props.left || props.initialLeft || 0,
    top: props.top || props.initialTop || 0,
  });

  const viewRef = React.useRef(null);

  const [zoom, setZoom] = React.useState(initialState.zoom);
  const [left, setLeft] = React.useState(initialState.left);
  const [top, setTop] = React.useState(initialState.top);
  const [constraints, setConstraints] = React.useState(initialState.constraints);
  const [translateX, setTranslateX] = React.useState(initialState.translateX);
  const [translateY, setTranslateY] = React.useState(initialState.translateY);
  const [scaleX, setScaleX] = React.useState(initialState.scaleX);
  const [scaleY, setScaleY] = React.useState(initialState.scaleY);
  const [eRect, setERect] = React.useState(initialState.eRect);

  const [isZooming, setIsZooming] = React.useState(false);
  const [isMoving, setIsMoving] = React.useState(false);

  const [pinchState, setPinchState] = React.useState({
    initialX: null,
    initialY: null,
    initialTop: null,
    initialLeft: null,
    initialZoom: null,
    initialDistance: null,
  });

  // Returns full component state (compatibility layer)
  const getState = () => ({
    zoom,
    left,
    top,
    constraints,
    translateX,
    translateY,
    scaleX,
    scaleY,
    eRect,
    isZooming,
    isMoving,
  });

  // React uses passive event listener by default, in which we can't
  // stop page scrolling at all. 
  // Workaround: while component is mounted, disallow page scrolling, unless
  // the prop `allowPageScrolling` is set to true.
  if (Platform.OS == 'web') {
    React.useEffect(() => {
      if (props.allowPageScrolling) return;
      const preventScroll = (event) => event.preventDefault();

      // Setup onWheel-event non-passively.
      let removeListener;

      if (viewRef && viewRef.current) {
        viewRef.current.addEventListener('wheel', preventScroll, { passive: false });
        removeListener = viewRef.current.removeEventListener;
      } 

      return () => {
        removeListener && removeListener('wheel', preventScroll);
      }
    }, [props.allowPageScrolling]);    
  }

  const zoomIn = () => {
    const { doubleTapZoom = 1.3 } = props;
    viewRef.current.measure((x, y, width, height) => {
      zoomBy(doubleTapZoom, width / 2, height / 2);
    });    
  };

  const zoomOut = () => {
    const { doubleTapZoom = 1.3 } = props;
    viewRef.current.measure((x, y, width, height) => {
      zoomBy(1 / doubleTapZoom, width / 2, height / 2);
    });
  };

  React.useImperativeHandle(zoomableSvgRef, () => ({
    zoomIn,
    zoomOut,
  }));

  const noop = () => {};
  const yes = () => true;
  const shouldRespond = (evt, { dx, dy }) => {
    const { moveThreshold = 5, doubleTapThreshold, lock } = props;
    return (
      !lock &&
      (evt.nativeEvent.touches.length === 2 ||
        dx * dx + dy * dy >= moveThreshold ||
        doubleTapThreshold)
    );
  };

  let lastRelease = 0;

  const checkDoubleTap = (timestamp, x, y, shift) => {
    const { doubleTapThreshold, doubleTapZoom = 2 } = props;
    if (doubleTapThreshold && timestamp - lastRelease < doubleTapThreshold) {
      zoomBy(shift ? 1 / doubleTapZoom : doubleTapZoom, x, y);
    }
    lastRelease = timestamp;
  };

  const onMouseUp = ({
    clientX,
    clientY,
    nativeEvent: { timeStamp, shiftKey },
  }) => {
    checkDoubleTap(timeStamp, clientX, clientY, shiftKey);
  };

  const _panResponder = PanResponder.create({
    onPanResponderGrant: noop,
    onPanResponderTerminate: noop,
    onShouldBlockNativeResponder: yes,
    onPanResponderTerminationRequest: yes,
    onMoveShouldSetPanResponder: shouldRespond,
    onStartShouldSetPanResponder: shouldRespond,
    onMoveShouldSetPanResponderCapture: shouldRespond,
    onStartShouldSetPanResponderCapture: shouldRespond,
    onPanResponderMove: e => {
      const { nativeEvent: { touches } } = e;
      const { length } = touches;
      if (length === 1) {
        const [{ pageX, pageY }] = touches;
        processTouch(pageX, pageY);
      } else if (length === 2) {
        const [touch1, touch2] = touches;
        processPinch(
          touch1.locationX || touch1.clientX || touch1.pageX,
          touch1.locationY || touch1.clientY || touch1.pageY,
          touch2.locationX || touch2.clientX || touch2.pageX,
          touch2.locationY || touch2.clientY || touch2.pageY,
        );
      } else {
        return;
      }

      e.preventDefault();
    },
    onPanResponderRelease: ({ nativeEvent: { timestamp } }, { x0, y0 }) => {
      if (Platform.OS !== 'web') {
        checkDoubleTap(timestamp, x0, y0);
      }

      setIsZooming(false);
      setIsMoving(false);
    },
  });

  const updateTransform = (input) => {
    if (input == null) return;
    const { zoom, left, top } = input;
    setZoom(zoom);
    setLeft(left);
    setTop(top);
  };  

  const onWheel = e => {
    let { clientX, clientY, deltaY } = e;

    if (e.nativeEvent) {
      // Use layer coordinates.
      clientX = e.nativeEvent.layerX;
      clientY = e.nativeEvent.layerY;
    }

    const { wheelZoom = DEFAULT_SCROLL_FACTOR } = props;
    const zoomAmount = deltaY > 0 ? wheelZoom : 1 / wheelZoom;
    zoomBy(zoomAmount, clientX, clientY);
  };

  const reset = (zoom = 1, left = 0, top = 0) => {
    const nextState = {
      zoom,
      left,
      top,
    };

    updateTransform(
      props.constrain ? constrainExtent(nextState) : nextState
    );
  };

  const constrainExtent = ({ zoom, left, top }) => {
    // Based on https://github.com/d3/d3-zoom/blob/3bd2bddd87d79bb5fc3984cfb59e36ebd1686dcf/src/zoom.js
    // Width and height of canvas in native device
    const {
      eRect: { width, height },
      constraints: {
        dynamic,
        scaleExtent: [minZoom, maxZoom],
        translateExtent: [min, max],
      },
    } = getState();

    const constrainedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));

    const { translateX, translateY, scaleX, scaleY } = getZoomTransform({
      ...getState(),
      zoom: constrainedZoom,
      left,
      top,
    });

    // Requested top left corner, width and height in root coordinates
    const vl = -translateX / scaleX;
    const vt = -translateY / scaleY;

    const vw = width / scaleX;
    const vh = height / scaleY;

    // Constraints
    let [minX, minY] = min;
    let [maxX, maxY] = max;

    if (dynamic) {
      // Extent of constraints
      const [ew, eh] = dynamic;

      // Amount of free space when zoomed out beyond a translateExtent
      const fx = Math.max(0, vw - ew);
      const fy = Math.max(0, vh - eh);

      minX -= fx;
      minY -= fy;

      maxX += fx;
      maxY += fy;
    }

    // Correction of top-left corner
    const dx0 = Math.max(vl, minX);
    const dy0 = Math.max(vt, minY);

    // Correction of bottom-right corner
    const dx1 = Math.min(vl, maxX - vw);
    const dy1 = Math.min(vt, maxY - vh);

    // Handle zooming out beyond translateExtent (if scaleExtent allows it)
    const x =
      dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1);
    const y =
      dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1);

    // Return corrected transform
    return {
      zoom: constrainedZoom,
      left: left + (vl - x) * scaleX,
      top: top + (vt - y) * scaleY,
    };
  };

  const processPinch = (x1, y1, x2, y2) => {
    const distance = calcDistance(x1, y1, x2, y2);
    const { x, y } = calcCenter(x1, y1, x2, y2);

    if (!isZooming) {
      const { top, left, zoom } = getState();

      setIsZooming(true);

      setPinchState({
        ...pinchState,
        initialX: x,
        initialY: y,
        initialTop: top,
        initialLeft: left,
        initialZoom: zoom,
        initialDistance: distance,
      });

    } else {
      const {
        initialX,
        initialY,
        initialTop,
        initialLeft,
        initialZoom,
        initialDistance,
      } = pinchState;

      const { constrain } = props;

      const touchZoom = distance / initialDistance;
      const dx = x - initialX;
      const dy = y - initialY;

      const constrainedTouchZoom = getConstrainedDelta(touchZoom, initialZoom);
      const newZoom = initialZoom * constrainedTouchZoom;
      const left = (initialLeft + dx - x) * constrainedTouchZoom + x;
      const top = (initialTop + dy - y) * constrainedTouchZoom + y;

      const nextState = {
        zoom: newZoom,
        left: left,
        top: top,
      };

      const constrainedNextState = constrain ? constrainExtent(nextState) : nextState;
      updateTransform(constrainedNextState);
    }
  };

  const processTouch = (x, y) => {
    if (!isMoving || isZooming) {
      const { top, left } = getState();

      setIsMoving(true);
      setIsZooming(false);

      setPinchState({
        ...pinchState,
        initialLeft: left,
        initialTop: top,
        initialX: x,
        initialY: y,        
      });

    } else {
      const { initialX, initialY, initialLeft, initialTop } = pinchState;
      const { constrain } = props;

      const dx = x - initialX;
      const dy = y - initialY;

      const nextState = {
        left: initialLeft + dx,
        top: initialTop + dy,
        zoom,
      };

      const constrainedNextState = constrain ? constrainExtent(nextState) : nextState;
      updateTransform(constrainedNextState);
    }
  };

  // Used to constrain the zooming-in.
  // If we just constrained the zoom, top/left values would
  // still be increased when trying to pinch/scroll further.
  // This method will prevent further translates when trying to
  // zoom further than maxZoom/minZoom by returning the max possible
  // value for dz.
  const getConstrainedDelta = (dz, initialZoom) => {
    const {
      constraints: {
        scaleExtent: [minZoom, maxZoom],
      },      
    } = getState();

    if (!props.constrain) {
      return dz;
    }

    const newZoom = initialZoom * dz;

    if (newZoom <= minZoom) {
      return minZoom / initialZoom;
    } else if (newZoom >= maxZoom) {
      return maxZoom / initialZoom;
    }

    return dz;
  };

  const zoomBy = (dzIn, x, y) => {
    const {
      top: initialTop,
      left: initialLeft,
      zoom: initialZoom,   
    } = getState();

    const { constrain, constrainZoom } = props;

    // Calculate new zoom value
    dz = getConstrainedDelta(dzIn, initialZoom);
    const zoom = initialZoom * dz;
    const left = (initialLeft - x) * dz + x;
    const top = (initialTop - y) * dz + y;

    const nextState = {
      zoom,
      left,
      top,
    };

    const constrainedNextState = constrain ? constrainExtent(nextState) : nextState;
    updateTransform(constrainedNextState);
  };

  const { children, width, height, style, svgProps, ...otherProps } = props;

  const transformedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        transform: serializeTransform(getZoomTransform(getState())),
      });
    }
    return child;      
  });

  const svgContainer = React.createElement(
    Svg, {
      width: width,
      height: height,
      ...svgProps,
    },
    transformedChildren,
  );

  return React.createElement(
    View, {
      onMouseUp: onMouseUp,
      onWheel: onWheel,
      style: style,
      ref: ref => viewRef.current = ref,
      ..._panResponder.panHandlers,
      ...otherProps,
    },
    svgContainer,
  );
});

ZoomableSvg.default = ZoomableSvg;

module.exports = ZoomableSvg;
