<script lang="ts">
 import DatePicker from '#lib/components/DatePicker.svelte';
 let {label,field,value,onchange,disabled=false}:{label:string;field:string;value:string;onchange:(value:string)=>void;disabled?:boolean}=$props();
 let open=$state(false);
</script>
<DatePicker {label} {field} {value} {disabled} {open} onToggle={()=>open=!open} onSelect={v=>{onchange(v);open=false;}}/>
