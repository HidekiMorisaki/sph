<script lang="ts">
 let {title,responsive=true}:{title:string;responsive?:boolean}=$props();
</script>
<h2 class:responsive>{title}</h2>
<style>
 h2{margin:0;color:var(--text);font-size:var(--font-size-section)}
 @media(max-width:700px),(min-width:701px) and (max-width:1024px) and (max-height:500px) and (any-pointer:coarse){h2.responsive{font-size:var(--font-size-subsection)}}
</style>
