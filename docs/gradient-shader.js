// WebGL Shader Gradient Background (shadergradient-inspired)
// This file contains the WebGL shader gradient background for the landing page

(function() {
  const canvas = document.getElementById('gradient-canvas');
  if (!canvas) return;
  
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return;
  
  // Vertex shader
  const vsSource = `#version 300 es
  precision highp float;
  in vec2 a_position;
  out vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }`;
  
  // Fragment shader - shadergradient-inspired gradient with noise and movement
  const fsSource = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 outColor;
  
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  
  // Hash function for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  
  // Value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                  mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    return n;
  }
  
  // FBM (Fractal Brownian Motion) for organic movement
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
  
  // Gradient interpolation
  vec3 mix3(vec3 a, vec3 b, float t) {
    return mix(a, b, smoothstep(0.0, 1.0, t));
  }
  
  // Smooth noise for organic shapes
  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 center = vec2(0.5, 0.5);
    
    // Time-based animation
    float time = u_time * 0.1;
    
    // Multiple gradient layers with organic movement
    vec3 col = vec3(0.0);
    
    // Layer 1: Base gradient with noise distortion
    vec2 uv1 = uv * 2.0 + vec2(sin(u_time * 0.3) * 0.3, cos(u_time * 0.4) * 0.2);
    float n1 = fbm(uv1 * 3.0 + u_time * 0.15);
    vec3 col1 = mix(vec3(0.039, 0.039, 0.071), vec3(0.059, 0.055, 0.118), n1);
    
    // Layer 2: Moving color blobs
    vec2 uv2 = uv * 1.5 + vec2(sin(u_time * 0.2) * 0.5, cos(u_time * 0.3) * 0.4);
    float n2 = fbm(uv2 * 2.0 + u_time * 0.1);
    vec3 color1 = vec3(0.039, 0.518, 1.0);    // Blue #0a84ff
    vec3 color2 = vec3(0.369, 0.361, 0.902);  // Purple #5e5ce6
    vec3 color3 = vec3(0.063, 0.820, 0.533);  // Green #30d158
    vec3 col2 = mix3(mix3(vec3(0.0), color1, n2), color2, 0.5);
    col2 = mix(col2, color3, 0.3);
    
    // Layer 3: Radial gradient from center
    float dist = length(uv - center) * 2.0;
    float radial = smoothstep(1.0, 0.0, dist);
    vec3 col3 = mix3(vec3(0.03, 0.03, 0.07), vec3(0.06, 0.06, 0.12), radial);
    
    // Combine layers
    col = mix(col1, col2, 0.4);
    col = mix(col, col3, 0.3);
    
    // Add subtle vignette
    float vignette = 1.0 - length(uv - 0.5) * 1.2;
    col *= vignette;
    
    // Gamma correction
    col = pow(col, vec3(1.0 / 2.2));
    
    outColor = vec4(col, 1.0);
  }
  
  // Helper functions
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
  vec3 mix3(vec3 a, vec3 b, float t) { return mix(a, b, smoothstep(0.0, 1.0, t)); }
  `;
  
  // Compile shaders
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  
  function createProgram(gl, vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }
  
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;
  
  const program = createProgram(gl, vs, fs);
  if (!program) return;
  
  // Setup geometry (full-screen quad)
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  
  // Uniform locations
  const uniforms = {
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    color1: gl.getUniformLocation(program, 'u_color1'),
    color2: gl.getUniformLocation(program, 'u_color2'),
    color3: gl.getUniformLocation(program, 'u_color3'),
  };
  
  // Colors matching the site's theme
  const colors = {
    color1: [10/255, 132/255, 255/255],    // #0a84ff - blue
    color2: [94/255, 92/255, 230/255],     // #5e5ce6 - purple
    color3: [48/255, 209/255, 88/255],     // #30d158 - green
  };
  
  // Resize handler
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  
  let startTime = performance.now();
  function render(time) {
    if (!gl) return;
    const currentTime = (time - startTime) * 0.001;
    
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    gl.uniform1f(uniforms.time, currentTime);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform3fv(uniforms.color1, colors.color1);
    gl.uniform3fv(uniforms.color2, colors.color2);
    gl.uniform3fv(uniforms.color3, colors.color3);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    requestAnimationFrame(render);
  }
  
  // Initialize
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(render);
})();